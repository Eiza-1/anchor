// The "Boost" engine: trims RAM of background processes and clears temp files.
// Safety rules (same as always): never touches processes with a visible window,
// never touches critical system processes, and only *trims* memory — kills nothing.
// "RAM freed" is measured system-wide (available memory before vs after).
const fs = require("fs");
const path = require("path");
const { runPS, runPSJson } = require("./ps");

const CRITICAL = [
  "System", "Idle", "Registry", "Memory Compression", "smss", "csrss", "wininit",
  "winlogon", "services", "lsass", "svchost", "dwm", "fontdrvhost", "explorer",
  "audiodg", "ctfmon", "sihost", "taskhostw", "SearchHost", "StartMenuExperienceHost",
  "ShellExperienceHost", "RuntimeBroker", "SecurityHealthService", "MsMpEng", "spoolsv",
  "conhost", "dllhost", "WmiPrvSE", "Anchor", "electron", "powershell",
];

async function clearRam() {
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

function cleanTempDir(dir) {
  let bytes = 0, files = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return { bytes, files }; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) {
        const sub = cleanTempDir(full);
        bytes += sub.bytes; files += sub.files;
        fs.rmdirSync(full);
      } else {
        const size = fs.statSync(full).size;
        fs.unlinkSync(full);
        bytes += size; files += 1;
      }
    } catch { /* in use — skip */ }
  }
  return { bytes, files };
}

function cleanTemp() {
  const dirs = [process.env.TEMP, path.join(process.env.SystemRoot || "C:\\Windows", "Temp")].filter(Boolean);
  let bytes = 0, files = 0;
  for (const d of dirs) { const r = cleanTempDir(d); bytes += r.bytes; files += r.files; }
  return { bytes, files };
}

async function emptyRecycleBin() {
  await runPS("Clear-RecycleBin -Force -ErrorAction SilentlyContinue");
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

async function runFullBoost({ includeTemp, includeRecycleBin }) {
  const ram = await clearRam();
  let temp = { bytes: 0, files: 0 };
  if (includeTemp) temp = cleanTemp();
  if (includeRecycleBin) await emptyRecycleBin();
  return { ...ram, tempBytes: temp.bytes, tempFiles: temp.files };
}

module.exports = { runFullBoost, createRestorePoint };
