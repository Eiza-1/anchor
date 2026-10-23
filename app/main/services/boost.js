// Memory trim + restore points. (Disk cleanup lives in cleanup.js — the
// one-click Boost runs its default set.)
// Trim safety rules: never touches processes with a visible window, never
// touches critical system processes, and only *trims* memory — kills nothing.
// "RAM freed" is measured system-wide (available memory before vs after).
const { runPS, runPSJson } = require("./ps");

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
        message: `Using the existing restore point from ${ago} — no need for another.`,
      };
    }
  }
  return createRestorePoint(description);
}

async function createRestorePoint(description) {
  const { code, err } = await runPS(`
Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord -Force
Enable-ComputerRestore -Drive $env:SystemDrive
Checkpoint-Computer -Description '${description.replace(/'/g, "")}' -RestorePointType MODIFY_SETTINGS
`);
  return code === 0
    ? { ok: true, message: "Restore point created. You can roll back any change from Windows System Restore." }
    : { ok: false, message: `Could not create restore point: ${err}` };
}

module.exports = { trimMemory, createRestorePoint, ensureRestorePoint, lastRestorePointAgeDays };
