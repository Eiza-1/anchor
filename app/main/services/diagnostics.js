// Deep system diagnostics: uptime damage, memory leaks, CPU-time hogs, error
// build-up — plus the in-house repairs for each. Everything here is a documented
// Windows mechanism; nothing undocumented or driver-level.
const { runPS, runPSJson } = require("./ps");

/* ------------------------------ uptime & state ---------------------------- */

async function systemState() {
  const r = await runPSJson(`
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$boot = $os.LastBootUpTime
$uptime = (Get-Date) - $boot

# Pending reboot flags — Windows sets these and then quietly waits, sometimes for weeks
$pending = @()
if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') {
  $pending += 'A Windows component update is waiting to finish'
}
if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') {
  $pending += 'Windows Update needs a restart to complete'
}
if ((Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name PendingFileRenameOperations).PendingFileRenameOperations) {
  $pending += 'Files are queued to be replaced on the next restart'
}
if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Services\\Pending') {
  $pending += 'A servicing operation is part-finished'
}

# Memory pools: non-paged pool growth is the classic driver-leak signature
$np = (Get-Counter '\\Memory\\Pool Nonpaged Bytes').CounterSamples[0].CookedValue
$pp = (Get-Counter '\\Memory\\Pool Paged Bytes').CounterSamples[0].CookedValue
$cache = (Get-Counter '\\Memory\\Standby Cache Normal Priority Bytes').CounterSamples[0].CookedValue
$commitPct = (Get-Counter '\\Memory\\% Committed Bytes In Use').CounterSamples[0].CookedValue
$pf = Get-CimInstance Win32_PageFileUsage | Select-Object -First 1

[PSCustomObject]@{
  bootTime      = [string]$boot
  uptimeHours   = [math]::Round($uptime.TotalHours, 1)
  pending       = $pending
  totalMemory   = [int64]$os.TotalVisibleMemorySize * 1024
  freeMemory    = [int64]$os.FreePhysicalMemory * 1024
  nonPagedPool  = [int64]$np
  pagedPool     = [int64]$pp
  standbyCache  = [int64]$cache
  commitPercent = [math]::Round($commitPct)
  pageFileUsedMB= [int]$pf.CurrentUsage
  pageFilePeakMB= [int]$pf.PeakUsage
  processCount  = (Get-Process).Count
  handleCount   = ((Get-Process | Measure-Object HandleCount -Sum).Sum)
} | ConvertTo-Json -Compress
`);
  return r;
}

/* --------------------------- per-process snapshot ------------------------- */

/** One sample of every process worth watching. The renderer keeps a history of
 *  these and fits a trend line — that's how a leak is distinguished from an app
 *  simply being large. */
async function processSnapshot() {
  const r = await runPSJson(`
$ErrorActionPreference = 'SilentlyContinue'
$now = Get-Date
Get-Process | Where-Object { $_.PrivateMemorySize64 -gt 20MB } | ForEach-Object {
  $cpuSec = 0.0
  try { $cpuSec = $_.TotalProcessorTime.TotalSeconds } catch {}
  $ageHours = 0.0
  try { $ageHours = ($now - $_.StartTime).TotalHours } catch {}
  [PSCustomObject]@{
    name    = $_.ProcessName
    pid     = $_.Id
    private = [int64]$_.PrivateMemorySize64
    handles = [int]$_.HandleCount
    threads = [int]$_.Threads.Count
    cpuSec  = [math]::Round($cpuSec, 1)
    ageHours= [math]::Round($ageHours, 2)
  }
} | Sort-Object private -Descending | Select-Object -First 40 | ConvertTo-Json -Compress
`);
  const list = Array.isArray(r) ? r : r ? [r] : [];
  return list.map((p) => ({
    ...p,
    // How much CPU this process has burned per hour it's been alive. A background
    // app quietly eating a core shows up here even when it looks idle right now.
    cpuPerHour: p.ageHours > 0.05 ? +(p.cpuSec / p.ageHours).toFixed(1) : 0,
  }));
}

/* ------------------------------ error build-up ---------------------------- */

async function errorHistory(days = 7) {
  const r = await runPSJson(`
$ErrorActionPreference = 'SilentlyContinue'
$since = (Get-Date).AddDays(-${days})
$ev = Get-WinEvent -FilterHashtable @{ LogName='System','Application'; Level=1,2; StartTime=$since } -MaxEvents 400
$groups = $ev | Group-Object ProviderName | Sort-Object Count -Descending | Select-Object -First 8
$out = foreach ($g in $groups) {
  [PSCustomObject]@{
    source = $g.Name
    count  = $g.Count
    latest = [string]($g.Group | Sort-Object TimeCreated -Descending | Select-Object -First 1).TimeCreated
    sample = [string](($g.Group | Select-Object -First 1).Message -split "\`n")[0]
  }
}
[PSCustomObject]@{ total = $ev.Count; groups = @($out) } | ConvertTo-Json -Depth 3 -Compress
`);
  return r ?? { total: 0, groups: [] };
}

/* -------------------------------- repairs --------------------------------- */
// Each repair is a documented Windows action. Slow ones report back when done.

const REPAIRS = {
  explorer: {
    name: "Restart Windows Explorer",
    detail: "Reloads the desktop, taskbar and File Explorer, clearing leaks that build up over days. The best fix for a sluggish desktop.",
    minutes: "instant",
    run: () => runPS("Stop-Process -Name explorer -Force; Start-Sleep -Seconds 1; if (-not (Get-Process explorer -EA SilentlyContinue)) { Start-Process explorer }"),
  },
  dns: {
    name: "Flush DNS cache",
    detail: "Clears stale name lookups. Fixes sites that won't load after a network change.",
    minutes: "instant",
    run: () => runPS("Clear-DnsClientCache"),
  },
  iconcache: {
    name: "Rebuild icon and thumbnail cache",
    detail: "Deletes corrupted icon caches and restarts Explorer to rebuild them. Fixes blank or wrong icons.",
    minutes: "instant",
    run: () => runPS(`
Stop-Process -Name explorer -Force
Remove-Item "$env:LOCALAPPDATA\\IconCache.db" -Force -EA SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache*" -Force -EA SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache*" -Force -EA SilentlyContinue
Start-Sleep -Seconds 1
if (-not (Get-Process explorer -EA SilentlyContinue)) { Start-Process explorer }`),
  },
  updatecache: {
    name: "Clear Windows Update cache",
    detail: "Empties the SoftwareDistribution folder and restarts the update services. Fixes updates that keep failing or stick at 0%.",
    minutes: "about a minute",
    run: () => runPS(`
Stop-Service wuauserv, bits -Force
Remove-Item "$env:SystemRoot\\SoftwareDistribution\\Download\\*" -Recurse -Force -EA SilentlyContinue
Start-Service wuauserv, bits`),
  },
  wer: {
    name: "Clear crash report queue",
    detail: "Empties queued Windows Error Reporting data, which can reach several GB.",
    minutes: "instant",
    run: () => runPS(`
Remove-Item "$env:ProgramData\\Microsoft\\Windows\\WER\\ReportQueue\\*" -Recurse -Force -EA SilentlyContinue
Remove-Item "$env:ProgramData\\Microsoft\\Windows\\WER\\ReportArchive\\*" -Recurse -Force -EA SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\WER\\*" -Recurse -Force -EA SilentlyContinue`),
  },
  sfc: {
    name: "Repair system files (SFC)",
    detail: "Checks protected Windows files against known-good copies and repairs damaged ones. Run it when errors keep coming back.",
    minutes: "5 to 15 minutes",
    run: () => runPS("sfc /scannow", { timeout: 1_800_000 }),
  },
  dism: {
    name: "Repair the component store (DISM)",
    detail: "Repairs the master copy SFC restores from. Run it if SFC couldn't fix something.",
    minutes: "10 to 30 minutes",
    run: () => runPS("DISM /Online /Cleanup-Image /RestoreHealth", { timeout: 3_600_000 }),
  },
  winsock: {
    name: "Reset network stack",
    detail: "Resets Winsock and TCP/IP to defaults. Fixes networking broken by a VPN or proxy install. Needs a restart.",
    minutes: "instant, then restart",
    run: () => runPS("netsh winsock reset; netsh int ip reset"),
  },
};

function listRepairs() {
  return Object.entries(REPAIRS).map(([id, r]) => ({
    id, name: r.name, detail: r.detail, minutes: r.minutes,
  }));
}

async function runRepair(id) {
  const r = REPAIRS[id];
  if (!r) return { ok: false, output: "", error: "Unknown repair" };
  const { code, out, err } = await r.run();
  return { ok: code === 0, output: out.slice(-2000), error: err.slice(-500) };
}

/** Trims one process's memory without killing it — useful on a leaking app you
 *  can't close yet. */
async function trimProcess(pid) {
  const { code, err } = await runPS(`
Add-Type -MemberDefinition '[DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);' -Name P -Namespace W
$p = Get-Process -Id ${Number(pid)}
[W.P]::EmptyWorkingSet($p.Handle)`);
  return { ok: code === 0, error: err };
}

async function restartService(name) {
  const safe = String(name).replace(/[^\w.-]/g, "");
  const { code, err } = await runPS(`Restart-Service -Name '${safe}' -Force`);
  return { ok: code === 0, error: err };
}

module.exports = {
  systemState, processSnapshot, errorHistory,
  listRepairs, runRepair, trimProcess, restartService,
};
