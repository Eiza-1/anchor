// Real-time hardware monitor.
// One long-lived PowerShell process emits a JSON sample every second on stdout —
// one-way streaming, so none of the request/response fragility of a shared host.
// Started when the user opens Performance, stopped when they leave.
const { spawn } = require("child_process");

let proc = null;
let send = () => {};

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$total = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
while ($true) {
  $cpu = $null; $disk = $null; $availMB = $null
  $s = Get-Counter '\\Processor(_Total)\\% Processor Time','\\PhysicalDisk(_Total)\\% Disk Time','\\Memory\\Available MBytes'
  foreach ($cs in $s.CounterSamples) {
    switch -Wildcard ($cs.Path) {
      '*processor*'     { $cpu = [math]::Round($cs.CookedValue) }
      '*disk time*'     { $disk = [math]::Round([math]::Min(100, $cs.CookedValue)) }
      '*available*'     { $availMB = [math]::Round($cs.CookedValue) }
    }
  }
  # GPU: sum the 3D engine across every adapter instance
  $gpu = $null
  $g = (Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage').CounterSamples
  if ($g) { $gpu = [math]::Round([math]::Min(100, ($g | Measure-Object CookedValue -Sum).Sum)) }
  # Dedicated VRAM in use
  $vram = $null
  $v = (Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage').CounterSamples
  if ($v) { $vram = [int64](($v | Measure-Object CookedValue -Sum).Sum) }

  $used = $null
  if ($total -and $availMB -ne $null) { $used = [int64]$total - ([int64]$availMB * 1MB) }

  [PSCustomObject]@{
    t = [int64](Get-Date -UFormat %s)
    cpu = $cpu; gpu = $gpu; disk = $disk
    memUsed = $used; memTotal = [int64]$total; vram = $vram
  } | ConvertTo-Json -Compress
  Start-Sleep -Milliseconds 900
}
`;

function start(webContents) {
  if (proc) return;
  send = (payload) => {
    if (webContents && !webContents.isDestroyed()) webContents.send("monitor:sample", payload);
  };

  proc = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT],
    { windowsHide: true }
  );
  proc.stdout.setEncoding("utf8");

  let buffer = "";
  proc.stdout.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("{")) continue;
      try { send(JSON.parse(line)); } catch { /* partial line — skip */ }
    }
  });

  proc.on("exit", () => { proc = null; });
  proc.on("error", () => { proc = null; });
}

function stop() {
  try { proc?.kill(); } catch {}
  proc = null;
}

module.exports = { start, stop };
