// PowerShell runner. Every system command Anchor executes goes through here,
// so auditing the app's system actions means auditing calls to this module.
//
// Two paths:
//  - runPSJson (reads, scans — the bulk of calls) goes to a small pool of
//    long-lived PowerShell hosts. Starting powershell.exe and loading the CIM
//    modules costs ~0.5–1s per call; a warm host answers in milliseconds.
//    Scripts travel as one base64 line each way, so multi-line scripts and
//    non-ASCII output (device and process names) survive intact.
//  - runPS (actions whose exit code decides success) keeps one process per
//    call, so its exit-code semantics are exactly PowerShell's own.
//  - runPSJson(cmd, { long: true }) is for scripts that run for minutes
//    (Windows Update search, disk benchmark, cleanup deletes). They get their
//    own process, so they never tie up a pooled host while pages wait for
//    reads, and they have no timeout — killing a delete half-way is worse.
const { spawn } = require("child_process");

const PS_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];

/** A PowerShell single-quoted literal for `value`, quotes included. PowerShell
 *  treats U+2018-U+201B like ' inside a literal, so all of them are doubled;
 *  doubling only ASCII lets a name with a curly quote end the string early. */
function psQuote(value) {
  return "'" + String(value).replace(/['‘-‛]/g, (c) => c + c) + "'";
}

function runPS(command) {
  return spawnPS(["-Command", command]);
}

function spawnPS(args) {
  return new Promise((resolve) => {
    const p = spawn("powershell.exe", [...PS_ARGS, ...args], { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.on("error", () => resolve({ code: -1, out: "", err: "PowerShell could not be started." }));
  });
}

/* ------------------------------- Host pool -------------------------------- */
const MARK = "@@ANCHOR@@";
const MAX_HOSTS = 3;                 // health check fires ~6 reads at once
const CALL_TIMEOUT_MS = 10 * 60_000; // a hung script costs one host, not the app
const IDLE_MS = 60_000;              // a host costs ~100 MB; an idle one exits, the next read starts another

// Reads one base64 script per line, runs it in a child scope (so a script's
// $ErrorActionPreference or variables never leak into the next one), and
// answers with one base64 JSON line. Output is gathered as it streams, so
// anything printed before a terminating error is kept — as with a fresh process.
const HOST_SCRIPT = `
$ProgressPreference = 'SilentlyContinue'
Import-Module CimCmdlets -ErrorAction SilentlyContinue
$null = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
[Console]::Out.WriteLine('${MARK}READY')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $items = New-Object System.Collections.Generic.List[object]
  try {
    $code = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line))
    & ([scriptblock]::Create($code)) *>&1 | ForEach-Object { $items.Add($_) }
  } catch { $items.Add($_) }
  $out = New-Object System.Text.StringBuilder
  $err = New-Object System.Text.StringBuilder
  foreach ($i in $items) {
    if ($i -is [System.Management.Automation.ErrorRecord]) { [void]$err.AppendLine($i.ToString()) }
    elseif ($i -is [System.Management.Automation.WarningRecord]) { [void]$out.AppendLine('WARNING: ' + $i.Message) }
    elseif ($i -is [System.Management.Automation.InformationRecord]) { [void]$out.AppendLine([string]$i.MessageData) }
    elseif ($i -is [System.Management.Automation.VerboseRecord] -or $i -is [System.Management.Automation.DebugRecord]) {}
    else { [void]$out.Append(($i | Out-String -Width 4096)) }
  }
  $json = @{ out = $out.ToString(); err = $err.ToString() } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine('${MARK}' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
}
`;
const ENCODED_HOST = Buffer.from(HOST_SCRIPT, "utf16le").toString("base64");

const hosts = new Set();
const queue = [];
let poolBroken = false;

function createHost() {
  const host = { proc: null, ready: false, job: null, buffer: "", dead: false, idleTimer: null };
  const proc = spawn("powershell.exe", [...PS_ARGS, "-EncodedCommand", ENCODED_HOST], { windowsHide: true });
  host.proc = proc;
  hosts.add(host);
  proc.stdout.setEncoding("ascii");
  proc.stderr.on("data", () => {}); // drain — a full pipe would stall the host

  proc.stdout.on("data", (chunk) => {
    host.buffer += chunk;
    let idx;
    while ((idx = host.buffer.indexOf("\n")) !== -1) {
      const line = host.buffer.slice(0, idx).trim();
      host.buffer = host.buffer.slice(idx + 1);
      if (!line.startsWith(MARK)) continue; // stray console writes
      const body = line.slice(MARK.length);
      if (body === "READY") { host.ready = true; pump(); continue; }
      const job = host.job;
      host.job = null;
      if (!job) continue;
      clearTimeout(job.timer);
      try {
        const r = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
        job.resolve({ out: String(r.out ?? "").trim(), err: String(r.err ?? "").trim() });
      } catch {
        job.resolve({ out: "", err: "Malformed reply from PowerShell host." });
      }
      pump();
    }
  });

  const die = () => {
    clearTimeout(host.idleTimer);
    if (host.dead) return;
    host.dead = true;
    hosts.delete(host);
    const job = host.job;
    host.job = null;
    if (job) {
      // Died mid-script: don't re-run (it may have had side effects) — report it.
      clearTimeout(job.timer);
      job.resolve({ out: "", err: "PowerShell host exited unexpectedly." });
    }
    // Never came up at all: stop using the pool and run everything the old way.
    if (!host.ready) poolBroken = true;
    pump();
  };
  proc.on("exit", die);
  proc.on("error", die);
  return host;
}

/** Out of the pool first, so no job lands on it; closing stdin ends its read loop. */
function retire(host) {
  host.dead = true;
  hosts.delete(host);
  try { host.proc.stdin.end(); } catch {}
}

function pump() {
  if (poolBroken) {
    for (const job of queue.splice(0)) runPS(job.command).then(({ out, err }) => job.resolve({ out, err }));
    return;
  }
  while (queue.length) {
    let host = [...hosts].find((h) => h.ready && !h.job);
    if (!host) {
      if (hosts.size < MAX_HOSTS && ![...hosts].some((h) => !h.ready)) createHost();
      return; // a host will call pump() when it's ready or free
    }
    const job = queue.shift();
    clearTimeout(host.idleTimer);
    host.idleTimer = null;
    host.job = job;
    job.timer = setTimeout(() => { try { host.proc.kill(); } catch {} }, CALL_TIMEOUT_MS);
    host.proc.stdin.write(Buffer.from(job.command, "utf8").toString("base64") + "\n");
  }
  for (const h of hosts) {
    if (h.ready && !h.job && !h.idleTimer) h.idleTimer = setTimeout(() => retire(h), IDLE_MS);
  }
}

function runPooled(command) {
  return new Promise((resolve) => {
    queue.push({ command, resolve, timer: null });
    if (hosts.size === 0 && !poolBroken) createHost();
    pump();
  });
}

// Encoded, so quotes and line breaks reach PowerShell intact; UTF-8 output, so
// non-ASCII text (update titles) survives as it does through the pool.
function runOneOff(command) {
  const script = "[Console]::OutputEncoding = [Text.Encoding]::UTF8\n" + command;
  return spawnPS(["-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")]);
}

async function runPSJson(command, { long = false } = {}) {
  const { out } = await (long ? runOneOff(command) : runPooled(command));
  if (!out) return null;
  // A cmdlet may print a warning before the JSON — start at the first { or [.
  const start = out.search(/[[{]/);
  if (start === -1) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

/** Starts two hosts at launch, off the critical path, so the first page is fast. */
let warmTimer = null;
function warmUp() {
  if (hosts.size === 0) createHost();
  warmTimer = setTimeout(() => { if (hosts.size < 2 && !poolBroken) createHost(); }, 1500);
}

function shutdown() {
  clearTimeout(warmTimer);
  poolBroken = true; // anything still queued runs one-off; no new hosts
  for (const h of hosts) { try { h.proc.kill(); } catch {} }
  hosts.clear();
}

module.exports = { psQuote, runPS, runPSJson, warmUp, shutdown };
