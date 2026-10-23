// Boot Watch — finds out what runs at startup and, crucially, WHY.
//
// The classic case: someone installs a cracked game, reboots, and sees a black
// console window flash for half a second. Windows offers no way to ask "what was
// that?". This module answers it two ways:
//   1. scanPersistence()  — enumerates every place Windows can auto-run something
//      (scheduled tasks, Run keys, Startup folders, services, WMI subscriptions,
//      Winlogon hooks, IFEO debuggers) and scores each for suspicious traits.
//   2. watchProcesses()   — streams process starts live, so a flash that happens
//      while Anchor is running is captured with its full command line.
//
// Nothing is removed automatically. Findings are explained; the user decides.
const { spawn } = require("child_process");
const { runPS, runPSJson } = require("./ps");

/* ------------------------------ risk scoring ------------------------------ */

// Interpreters and living-off-the-land binaries abused to run downloaded payloads.
const INTERPRETERS = [
  "cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe",
  "mshta.exe", "rundll32.exe", "regsvr32.exe", "certutil.exe", "bitsadmin.exe",
  "curl.exe", "wget.exe", "msiexec.exe", "installutil.exe", "conhost.exe",
];

// Folders any user (or installer) can write to — unusual homes for boot code.
const USER_WRITABLE = [
  "\\appdata\\", "\\temp\\", "\\tmp\\", "\\programdata\\", "\\users\\public\\",
  "\\downloads\\", "\\documents\\", "\\desktop\\", "\\recycle",
];

// Command-line traits associated with hiding or fetching code.
const RED_FLAGS = [
  { re: /-enc(odedcommand)?\s/i, why: "runs a Base64-encoded command, which hides what it actually does" },
  { re: /frombase64string/i, why: "decodes Base64 at runtime — a common way to conceal a payload" },
  { re: /-w(indowstyle)?\s+hidden/i, why: "deliberately hides its own window" },
  { re: /-nop(rofile)?\b/i, why: "skips the PowerShell profile, typical of scripted payloads" },
  { re: /(iex|invoke-expression)/i, why: "executes text as code at runtime" },
  { re: /(downloadstring|downloadfile|invoke-webrequest|iwr\s|curl\s|wget\s)/i, why: "downloads something from the internet" },
  { re: /https?:\/\//i, why: "contains a web address" },
  { re: /\bstart\s+\/min\b/i, why: "starts minimised so you don't see it" },
  { re: /\bvbscript|\.vbs\b|\.js\b|\.bat\b|\.cmd\b|\.ps1\b/i, why: "runs a script file" },
  { re: /taskkill|net\s+stop|sc\s+stop/i, why: "stops other programs or services" },
  { re: /(defender|msmpeng|windowsdefender)/i, why: "references Windows Defender" },
  { re: /\bhosts\b/i, why: "touches the hosts file, which can redirect web traffic" },
];

// Names that often accompany game repacks / cracks.
const REPACK_HINTS = [
  { re: /(fitgirl|dodi|codex|skidrow|plaza|empress|rune|tenoke|goldberg|onlinefix)/i,
    why: "the name matches a known game-repack or crack toolkit" },
  { re: /(steam_api|steamclient|crack|keygen|activator|loader)/i,
    why: "the name matches crack/activation tooling" },
];

function assess({ name, command, path, source, runAs, author }) {
  const text = `${name ?? ""} ${command ?? ""} ${path ?? ""}`.toLowerCase();
  const reasons = [];
  let score = 0;

  const exe = (command ?? path ?? "").toLowerCase();
  const interpreter = INTERPRETERS.find((i) => exe.includes(i));
  if (interpreter) {
    score += 25;
    reasons.push(`launches ${interpreter}, a script interpreter rather than a normal program`);
  }

  const folder = USER_WRITABLE.find((f) => text.includes(f));
  if (folder) {
    score += 25;
    reasons.push(`runs from ${folder.replace(/\\/g, "")}, a folder any program can write to`);
  }

  for (const f of RED_FLAGS) if (f.re.test(text)) { score += 15; reasons.push(f.why); }
  for (const h of REPACK_HINTS) if (h.re.test(text)) { score += 35; reasons.push(h.why); }

  if (/system/i.test(runAs ?? "") && folder) {
    score += 20;
    reasons.push("runs with full SYSTEM privileges from a user-writable folder");
  }
  if (source === "WMI subscription") {
    score += 30;
    reasons.push("uses a WMI event subscription — a persistence method almost never used by legitimate software");
  }
  if (source === "IFEO debugger") {
    score += 40;
    reasons.push("hijacks another program's launch via an Image File Execution Options debugger");
  }
  if (source === "Winlogon hook") {
    score += 30;
    reasons.push("hooks the Windows logon process");
  }

  // Signed, Microsoft-pathed things are almost always fine.
  if (/\\windows\\system32\\/i.test(path ?? "") && !interpreter) score -= 20;
  if (/\\program files/i.test(path ?? "")) score -= 10;

  score = Math.max(0, Math.min(100, score));
  const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, level, reasons };
}

/* ---------------------------- persistence scan ---------------------------- */

async function scanPersistence() {
  const raw = await runPSJson(`
$ErrorActionPreference = 'SilentlyContinue'
$out = @()

# --- Scheduled tasks that fire at logon or boot ---
foreach ($t in Get-ScheduledTask) {
  $trig = ($t.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ','
  if ($trig -notmatch 'Logon|Boot|Startup' -and $t.TaskPath -like '\\Microsoft\\*') { continue }
  foreach ($a in $t.Actions) {
    if (-not $a.Execute) { continue }
    $info = $t | Get-ScheduledTaskInfo
    $out += [PSCustomObject]@{
      source='Scheduled task'; name=$t.TaskName; location=$t.TaskPath
      command=(($a.Execute + ' ' + $a.Arguments).Trim()); path=$a.Execute
      runAs=$t.Principal.UserId; author=$t.Author; trigger=$trig
      enabled=($t.State -ne 'Disabled'); lastRun=[string]$info.LastRunTime
      id=('task|' + $t.TaskPath + $t.TaskName)
    }
  }
}

# --- Run / RunOnce keys ---
$runKeys = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
)
foreach ($k in $runKeys) {
  if (-not (Test-Path $k)) { continue }
  $item = Get-Item $k
  foreach ($n in $item.GetValueNames()) {
    if (-not $n) { continue }
    $v = [string]$item.GetValue($n)
    $out += [PSCustomObject]@{
      source='Run key'; name=$n; location=$k; command=$v; path=$v
      runAs=$(if ($k -like 'HKLM*') {'All users'} else {'You'}); author=$null; trigger='At logon'
      enabled=$true; lastRun=$null; id=('run|' + $k + '|' + $n)
    }
  }
}

# --- Startup folders ---
$startupDirs = @(
  [Environment]::GetFolderPath('Startup'),
  [Environment]::GetFolderPath('CommonStartup')
)
foreach ($d in $startupDirs) {
  if (-not $d -or -not (Test-Path $d)) { continue }
  foreach ($f in Get-ChildItem $d -File) {
    $out += [PSCustomObject]@{
      source='Startup folder'; name=$f.Name; location=$d; command=$f.FullName; path=$f.FullName
      runAs='You'; author=$null; trigger='At logon'; enabled=$true
      lastRun=[string]$f.CreationTime; id=('file|' + $f.FullName)
    }
  }
}

# --- Services pointing at user-writable locations ---
foreach ($s in Get-CimInstance Win32_Service) {
  if ($s.PathName -match 'appdata|\\\\temp\\\\|programdata|users\\\\public|downloads') {
    $out += [PSCustomObject]@{
      source='Service'; name=$s.Name; location=$s.DisplayName; command=$s.PathName; path=$s.PathName
      runAs=$s.StartName; author=$null; trigger=$s.StartMode; enabled=($s.State -eq 'Running')
      lastRun=$null; id=('service|' + $s.Name)
    }
  }
}

# --- WMI permanent event subscriptions (rare, and a malware favourite) ---
foreach ($c in Get-CimInstance -Namespace root\\subscription -ClassName CommandLineEventConsumer) {
  $out += [PSCustomObject]@{
    source='WMI subscription'; name=$c.Name; location='root\\subscription'
    command=(($c.ExecutablePath + ' ' + $c.CommandLineTemplate).Trim()); path=$c.ExecutablePath
    runAs='SYSTEM'; author=$null; trigger='WMI event'; enabled=$true; lastRun=$null
    id=('wmi|' + $c.Name)
  }
}

# --- Winlogon Shell / Userinit hooks ---
$wl = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
foreach ($p in 'Shell','Userinit') {
  $v = [string]$wl.$p
  if ($v -and $v -notmatch '^(explorer\\.exe|C:\\\\Windows\\\\system32\\\\userinit\\.exe,?)$') {
    $out += [PSCustomObject]@{
      source='Winlogon hook'; name=$p; location='Winlogon'; command=$v; path=$v
      runAs='You'; author=$null; trigger='At logon'; enabled=$true; lastRun=$null
      id=('winlogon|' + $p)
    }
  }
}

# --- Image File Execution Options debuggers ---
$ifeo = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
foreach ($k in Get-ChildItem $ifeo) {
  $dbg = (Get-ItemProperty $k.PSPath).Debugger
  if ($dbg) {
    $out += [PSCustomObject]@{
      source='IFEO debugger'; name=$k.PSChildName; location='Image File Execution Options'
      command=$dbg; path=$dbg; runAs='Varies'; author=$null; trigger=('When ' + $k.PSChildName + ' starts')
      enabled=$true; lastRun=$null; id=('ifeo|' + $k.PSChildName)
    }
  }
}

ConvertTo-Json @($out) -Depth 3 -Compress
`);

  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((e) => ({ ...e, ...assess(e) }))
    .sort((a, b) => b.score - a.score);
}

/* --------------------------- live process watch --------------------------- */

let watcher = null;

const WATCH_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Register-CimIndicationEvent -ClassName Win32_ProcessStartTrace -SourceIdentifier AnchorProcWatch | Out-Null
while ($true) {
  $e = Wait-Event -SourceIdentifier AnchorProcWatch -Timeout 3600
  if (-not $e) { continue }
  $t = $e.SourceEventArgs.NewEvent
  # command line often survives long enough to read even for short-lived processes
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($t.ProcessID)"
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($t.ParentProcessID)"
  [PSCustomObject]@{
    time = [int64](Get-Date -UFormat %s)
    name = [string]$t.ProcessName
    pid = [int]$t.ProcessID
    parent = [string]$parent.Name
    parentPid = [int]$t.ParentProcessID
    command = [string]$p.CommandLine
    path = [string]$p.ExecutablePath
  } | ConvertTo-Json -Compress
  Remove-Event -EventIdentifier $e.EventIdentifier
}
`;

/** Streams process starts. Only interesting ones are forwarded to the UI. */
/** getContents returns the window's current webContents, or null while it's released. */
function watchProcesses(getContents) {
  if (watcher) return;
  watcher = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WATCH_SCRIPT],
    { windowsHide: true }
  );
  watcher.stdout.setEncoding("utf8");

  let buffer = "";
  watcher.stdout.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line.startsWith("{")) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }

      const name = (ev.name ?? "").toLowerCase();
      if (!INTERPRETERS.includes(name)) continue;          // only the flashy ones
      if (/anchor|electron|npm|node\.exe/i.test(ev.parent ?? "")) continue; // our own

      const verdict = assess({
        name: ev.name, command: ev.command, path: ev.path, source: "Process start",
      });
      if (verdict.score < 20) continue;                     // ignore benign noise

      const webContents = getContents();
      if (webContents && !webContents.isDestroyed())
        webContents.send("bootwatch:process", { ...ev, ...verdict });
    }
  });

  watcher.on("exit", () => { watcher = null; });
  watcher.on("error", () => { watcher = null; });
}

function stopWatching() {
  try { watcher?.kill(); } catch {}
  watcher = null;
}

/* ------------------------------ remediation ------------------------------- */

/** Disables (never silently deletes) a persistence entry. */
async function disableEntry(id) {
  const [kind, ...rest] = String(id).split("|");
  const target = rest.join("|");
  let cmd = "";

  switch (kind) {
    case "task": {
      const path = target.replace(/([^\\]+)$/, "");
      const name = target.slice(path.length);
      cmd = `Disable-ScheduledTask -TaskPath '${path.replace(/'/g, "''")}' -TaskName '${name.replace(/'/g, "''")}'`;
      break;
    }
    case "run": {
      const [key, valueName] = target.split("|");
      cmd = `Remove-ItemProperty -Path '${key}' -Name '${valueName.replace(/'/g, "''")}' -Force`;
      break;
    }
    case "file":
      // move to a quarantine folder rather than delete, so it can be restored
      cmd = `
$q = Join-Path $env:LOCALAPPDATA 'Anchor\\Quarantine'
New-Item -ItemType Directory -Force $q | Out-Null
Move-Item -LiteralPath '${target.replace(/'/g, "''")}' -Destination $q -Force`;
      break;
    case "service":
      cmd = `Set-Service -Name '${target.replace(/'/g, "''")}' -StartupType Disabled; Stop-Service -Name '${target.replace(/'/g, "''")}' -Force`;
      break;
    case "wmi":
      cmd = `Get-CimInstance -Namespace root\\subscription -ClassName CommandLineEventConsumer -Filter "Name='${target.replace(/'/g, "''")}'" | Remove-CimInstance`;
      break;
    case "ifeo":
      cmd = `Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${target}' -Name Debugger -Force`;
      break;
    default:
      return { ok: false, error: "This entry can't be disabled automatically." };
  }

  const { code, err } = await runPS(cmd);
  return { ok: code === 0, error: err };
}

module.exports = { scanPersistence, watchProcesses, stopWatching, disableEntry };
