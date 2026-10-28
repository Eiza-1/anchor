// Memory trim + restore points. (Disk cleanup lives in cleanup.js — the
// one-click Boost runs its default set.)
// Trim safety rules: never touches processes with a visible window, never
// touches critical system processes, and only *trims* memory — kills nothing.
// "RAM freed" is measured system-wide (available memory before vs after).
const { psQuote, runPS, runPSJson } = require("./ps");

const CRITICAL = [
  "System", "Idle", "Registry", "Memory Compression", "smss", "csrss", "wininit",
  "winlogon", "services", "lsass", "svchost", "dwm", "fontdrvhost", "explorer",
  "audiodg", "ctfmon", "sihost", "taskhostw", "SearchHost", "StartMenuExperienceHost",
  "ShellExperienceHost", "RuntimeBroker", "SecurityHealthService", "MsMpEng", "spoolsv",
  "conhost", "dllhost", "WmiPrvSE", "Anchor", "electron", "powershell",
];

async function trimMemory() {
  const criticalPs = CRITICAL.map((c) => `'${c}'`).join(",");
  const script = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -MemberDefinition '[DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr hProcess);' -Name PsApi -Namespace Win32
$critical=@(${criticalPs})
$before=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
$trimmed=0; $skipped=@()
foreach($p in Get-Process){
  if($critical -contains $p.ProcessName){ $skipped+=($p.ProcessName+' (system)'); continue }
  if($p.MainWindowHandle -ne 0){ $skipped+=($p.ProcessName+' (open window)'); continue }
  try { if([Win32.PsApi]::EmptyWorkingSet($p.Handle)){ $trimmed++ } } catch {}
}
Start-Sleep -Milliseconds 600
$after=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
[PSCustomObject]@{trimmed=$trimmed; freedBytes=[math]::Max(0,($after-$before))*1024; skipped=($skipped|Sort-Object -Unique)} | ConvertTo-Json -Compress
`;
  return (await runPSJson(script)) ?? { trimmed: 0, freedBytes: 0, skipped: [] };
}

// Smart Boost thresholds. Trimming only pays off when RAM is short: with plenty
// free it just makes apps page their memory back in when next used.
const TRIM_BELOW_AVAILABLE_PCT = 30;
const TRIM_MIN_WORKING_SET = 50 * 1024 * 1024; // only processes worth trimming
const HOG_CPU_PCT = 5;                         // % of the whole CPU, over the sample

/**
 * Home's Boost, after the cleanup: samples CPU for 2 s, then
 *  - background CPU hogs (no window, this user's session, not critical) get
 *    Below Normal priority, so whatever you're using comes first. Nothing is
 *    closed, and the priority resets when the app restarts;
 *  - if available RAM is under 30%, idle background processes with a large
 *    working set are trimmed. Above that, nothing is trimmed and Boost says so.
 * Freed RAM is the rise in available memory across the whole system: summing
 * each process's working-set drop would count shared pages (DLLs) many times.
 */
async function boostSystem() {
  const criticalPs = CRITICAL.map((c) => `'${c}'`).join(",");
  const script = `
$ErrorActionPreference='SilentlyContinue'
if (-not ('Win32.PsApi' -as [type])) {
  Add-Type -MemberDefinition '[DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr hProcess);' -Name PsApi -Namespace Win32
}
$critical=@(${criticalPs})
$session=(Get-Process -Id $PID).SessionId
$cores=[Environment]::ProcessorCount
$os=Get-CimInstance Win32_OperatingSystem
$availBefore=[double]$os.FreePhysicalMemory*1KB; $total=[double]$os.TotalVisibleMemorySize*1KB

$t0=@{}; foreach($p in Get-Process){ $t0[$p.Id]=$p.TotalProcessorTime.TotalMilliseconds }
$sw=[Diagnostics.Stopwatch]::StartNew(); Start-Sleep -Milliseconds 2000; $ms=$sw.ElapsedMilliseconds

$hogs=@{}; $trimmable=@()
foreach($p in Get-Process){
  if($critical -contains $p.ProcessName -or $p.Id -eq $PID -or -not $t0.ContainsKey($p.Id)){ continue }
  if($p.MainWindowHandle -ne 0){ continue }                      # something you're looking at
  $cpu=($p.TotalProcessorTime.TotalMilliseconds - $t0[$p.Id]) / ($ms * $cores) * 100
  if($cpu -ge ${HOG_CPU_PCT} -and $p.SessionId -eq $session){
    $lowered=$false
    if($p.PriorityClass -eq 'Normal'){ try { $p.PriorityClass='BelowNormal'; $lowered=$true } catch {} }
    $h=$hogs[$p.ProcessName]; if(-not $h){ $h=@{ name=$p.ProcessName; cpu=0.0; lowered=$false }; $hogs[$p.ProcessName]=$h }
    $h.cpu+=$cpu; if($lowered){ $h.lowered=$true }
  } elseif($cpu -lt 1 -and $p.WorkingSet64 -ge ${TRIM_MIN_WORKING_SET}){ $trimmable+=$p }
}

$availPct=[math]::Round($availBefore/$total*100)
$trim=@{ ran=$false; availPctBefore=$availPct; availPctAfter=$availPct; freedBytes=0; count=0 }
if($availPct -lt ${TRIM_BELOW_AVAILABLE_PCT}){
  $n=0
  $before=[double](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1KB
  foreach($p in $trimmable){ try { if([Win32.PsApi]::EmptyWorkingSet($p.Handle)){ $n++ } } catch {} }
  Start-Sleep -Milliseconds 600
  $after=[double](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1KB
  $trim=@{ ran=$true; availPctBefore=$availPct; availPctAfter=[math]::Round($after/$total*100); freedBytes=[math]::Max(0,$after-$before); count=$n }
}
[PSCustomObject]@{
  trim=$trim
  hogs=@($hogs.Values | Sort-Object { $_.cpu } -Descending | ForEach-Object { @{ name=$_.name; cpu=[math]::Round($_.cpu,1); lowered=$_.lowered } })
} | ConvertTo-Json -Compress -Depth 4
`;
  const r = await runPSJson(script, { long: true });
  const hogs = Array.isArray(r?.hogs) ? r.hogs : r?.hogs ? [r.hogs] : [];
  return {
    trim: r?.trim ?? { ran: false, availPctBefore: null, availPctAfter: null, freedBytes: 0, count: 0 },
    hogs,
  };
}

/** How long ago the most recent restore point was made, in days. */
async function lastRestorePointAgeDays() {
  const r = await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$p = Get-ComputerRestorePoint | Sort-Object CreationTime -Descending | Select-Object -First 1
if ($p) {
  $d = [Management.ManagementDateTimeConverter]::ToDateTime($p.CreationTime)
  [PSCustomObject]@{ days = ((Get-Date) - $d).TotalDays; description = $p.Description } | ConvertTo-Json -Compress
} else {
  [PSCustomObject]@{ days = 99999; description = $null } | ConvertTo-Json -Compress
}
`);
  return { days: r?.days ?? 99999, description: r?.description ?? null };
}

/**
 * Creates a restore point only if one doesn't already cover this period.
 * Restore points cost disk space and Windows deletes the oldest to make room,
 * so making one on every action would push older, more useful ones out.
 * minIntervalDays: 7 (weekly), 30 (monthly), or 0 to always create one.
 */
async function ensureRestorePoint(description, minIntervalDays = 7) {
  if (minIntervalDays > 0) {
    const last = await lastRestorePointAgeDays();
    if (last.days < minIntervalDays) {
      const ago = last.days < 1
        ? "earlier today"
        : `${Math.round(last.days)} day${Math.round(last.days) === 1 ? "" : "s"} ago`;
      return {
        ok: true,
        skipped: true,
        message: `Using your restore point from ${ago}.`,
      };
    }
  }
  return createRestorePoint(description);
}

async function createRestorePoint(description) {
  const { code, err } = await runPS(`
Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord -Force
Enable-ComputerRestore -Drive $env:SystemDrive
Checkpoint-Computer -Description ${psQuote(description)} -RestorePointType MODIFY_SETTINGS
`);
  return code === 0
    ? { ok: true, message: "Restore point created. Roll back any change from System Restore." }
    : { ok: false, message: `Could not create restore point: ${err}` };
}

module.exports = { trimMemory, boostSystem, createRestorePoint, ensureRestorePoint, lastRestorePointAgeDays };
