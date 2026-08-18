// Performance tweaks for games and heavy apps.
// Every tweak names the exact registry value or Windows command it uses, is read
// back so the UI always shows real state, and can be reverted from the same page.
// Nothing here touches security features.
const { runPS, runPSJson } = require("./ps");

// --- registry-based tweaks -------------------------------------------------
// on/off are the DWORD values written; `off` restores the Windows default.
const TWEAKS = [
  {
    id: "gamemode",
    name: "Windows Game Mode",
    desc: "Prioritises the game you're playing and stops Windows Update restarting during play. Registry: HKCU\\Software\\Microsoft\\GameBar\\AutoGameModeEnabled = 1",
    category: "Gaming",
    hive: "HKCU:", key: "Software\\Microsoft\\GameBar", value: "AutoGameModeEnabled", on: 1, off: 0,
  },
  {
    id: "gamedvr",
    name: "Disable background game recording (Game DVR)",
    desc: "Xbox Game Bar records gameplay in the background even when you never use it, costing frames. Registry: HKCU\\System\\GameConfigStore\\GameDVR_Enabled = 0",
    category: "Gaming",
    hive: "HKCU:", key: "System\\GameConfigStore", value: "GameDVR_Enabled", on: 0, off: 1,
  },
  {
    id: "gamebar",
    name: "Disable Xbox Game Bar overlay",
    desc: "Stops the Game Bar overlay loading with every game. Registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR\\AppCaptureEnabled = 0",
    category: "Gaming",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR", value: "AppCaptureEnabled", on: 0, off: 1,
  },
  {
    id: "hags",
    name: "Hardware-accelerated GPU scheduling",
    desc: "Lets the GPU manage its own memory scheduling, reducing latency on modern GPUs. Needs a restart. Registry: HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\\HwSchMode = 2",
    category: "Graphics",
    needsRestart: true,
    hive: "HKLM:", key: "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", value: "HwSchMode", on: 2, off: 1,
  },
  {
    id: "swapchain",
    name: "Optimizations for windowed games",
    desc: "Upgrades a game's swap chain so borderless-windowed play gets near-fullscreen latency. Same switch as Settings > Gaming > Graphics. Registry: HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences\\DirectXUserGlobalSettings → SwapEffectUpgradeEnable=1",
    category: "Graphics",
    hive: "HKCU:", key: "Software\\Microsoft\\DirectX\\UserGpuPreferences",
    value: "DirectXUserGlobalSettings", kind: "flag", flag: "SwapEffectUpgradeEnable", on: "1", off: "0",
  },
  {
    id: "vrr",
    name: "Variable refresh rate",
    desc: "Lets VRR / G-Sync / FreeSync apply to games that don't support it natively. Requires a VRR-capable display. Registry: DirectXUserGlobalSettings → VRROptimizeEnable=1",
    category: "Graphics",
    hive: "HKCU:", key: "Software\\Microsoft\\DirectX\\UserGpuPreferences",
    value: "DirectXUserGlobalSettings", kind: "flag", flag: "VRROptimizeEnable", on: "1", off: "0",
  },
  {
    id: "fse",
    name: "Disable fullscreen optimizations",
    desc: "Windows runs many 'fullscreen' games in a composited borderless mode. Turning it off restores true exclusive fullscreen, usually lowering latency. Registry: HKCU\\System\\GameConfigStore\\GameDVR_FSEBehaviorMode = 2",
    category: "Graphics",
    hive: "HKCU:", key: "System\\GameConfigStore", value: "GameDVR_FSEBehaviorMode", on: 2, off: 0,
  },
  {
    id: "mpo",
    name: "Disable Multi-Plane Overlay (troubleshooting)",
    desc: "NVIDIA's and Microsoft's own workaround for flickering, black flashes or stutter on some setups. This is a fix for a specific symptom, not a general speed-up — leave it off unless you see flickering. Registry: HKLM\\SOFTWARE\\Microsoft\\Windows\\Dwm\\OverlayTestMode = 5",
    category: "Graphics",
    needsRestart: true,
    hive: "HKLM:", key: "SOFTWARE\\Microsoft\\Windows\\Dwm", value: "OverlayTestMode", on: 5, off: 0,
  },
  {
    id: "bgapps",
    name: "Stop Store apps running in the background",
    desc: "Background UWP apps quietly use CPU, RAM and network. Registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications\\GlobalUserDisabled = 1",
    category: "System",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications", value: "GlobalUserDisabled", on: 1, off: 0,
  },
  {
    id: "startupdelay",
    name: "Remove the startup app delay",
    desc: "Windows deliberately delays startup apps by ~10 seconds after login. Registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize\\StartupDelayInMSec = 0",
    category: "System",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", value: "StartupDelayInMSec", on: 0, off: 1,
  },
  {
    id: "menudelay",
    name: "Instant menus (remove animation delay)",
    desc: "Drops the built-in menu delay so the desktop feels snappier. Registry: HKCU\\Control Panel\\Desktop\\MenuShowDelay = 0 (default 400)",
    category: "Responsiveness",
    hive: "HKCU:", key: "Control Panel\\Desktop", value: "MenuShowDelay", on: 0, off: 400, kind: "string",
  },
  {
    id: "visualfx",
    name: "Reduce animations and visual effects",
    desc: "Switches Windows to 'best performance' visuals — no fades or slide animations. Registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects\\VisualFXSetting = 2",
    category: "Responsiveness",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects", value: "VisualFXSetting", on: 2, off: 0,
  },
  {
    id: "transparency",
    name: "Disable transparency effects",
    desc: "Acrylic/blur costs GPU time on laptops and integrated graphics. Registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\\EnableTransparency = 0",
    category: "Responsiveness",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", value: "EnableTransparency", on: 0, off: 1,
  },
];

// Applied by "Apply recommended" — everything except the restart-requiring one.
const RECOMMENDED = [
  "gamemode", "gamedvr", "gamebar", "swapchain", "fse",
  "bgapps", "startupdelay", "menudelay", "visualfx",
];

/** Some DirectX settings share one string value like
 *  "SwapEffectUpgradeEnable=1;VRROptimizeEnable=0;" — parse it into a map. */
function parseFlags(s) {
  const map = {};
  for (const part of String(s ?? "").split(";")) {
    const [k, v] = part.split("=");
    if (k) map[k.trim()] = (v ?? "").trim();
  }
  return map;
}
const serializeFlags = (map) =>
  Object.entries(map).filter(([k]) => k).map(([k, v]) => `${k}=${v}`).join(";") + ";";

async function listTweaks() {
  const reads = TWEAKS.map(
    (t, i) => `$v${i}=(Get-ItemProperty -Path '${t.hive}\\${t.key}' -Name '${t.value}' -ErrorAction SilentlyContinue).'${t.value}'`
  ).join("\n");
  const outs = TWEAKS.map((t, i) => `'${t.id}'=$v${i}`).join(";");
  const values = (await runPSJson(`${reads}\n@{${outs}} | ConvertTo-Json -Compress`)) ?? {};

  return TWEAKS.map((t) => {
    const raw = values[t.id];
    const applied =
      t.kind === "flag"
        ? parseFlags(raw)[t.flag] === String(t.on)
        : String(raw ?? "") === String(t.on);
    return {
      id: t.id, name: t.name, desc: t.desc, category: t.category,
      needsRestart: !!t.needsRestart,
      recommended: RECOMMENDED.includes(t.id),
      applied,
    };
  });
}

async function applyTweak(id, on) {
  const t = TWEAKS.find((x) => x.id === id);
  if (!t) return { ok: false, error: "Unknown tweak" };

  if (t.kind === "flag") {
    // read-modify-write so sibling flags in the same value survive
    const current = await runPSJson(
      `@{v=(Get-ItemProperty -Path '${t.hive}\\${t.key}' -Name '${t.value}' -ErrorAction SilentlyContinue).'${t.value}'} | ConvertTo-Json -Compress`
    );
    const map = parseFlags(current?.v);
    map[t.flag] = String(on ? t.on : t.off);
    const { code, err } = await runPS(`
if(-not (Test-Path '${t.hive}\\${t.key}')){ New-Item -Path '${t.hive}\\${t.key}' -Force | Out-Null }
Set-ItemProperty -Path '${t.hive}\\${t.key}' -Name '${t.value}' -Value '${serializeFlags(map)}' -Type String
`);
    return { ok: code === 0, error: err };
  }

  const value = on ? t.on : t.off;
  const type = t.kind === "string" ? "String" : "DWord";
  const { code, err } = await runPS(`
if(-not (Test-Path '${t.hive}\\${t.key}')){ New-Item -Path '${t.hive}\\${t.key}' -Force | Out-Null }
Set-ItemProperty -Path '${t.hive}\\${t.key}' -Name '${t.value}' -Value ${type === "String" ? `'${value}'` : value} -Type ${type}
`);
  return { ok: code === 0, error: err };
}

// --- power plan ------------------------------------------------------------
async function getPowerPlan() {
  const out = await runPSJson(`
$active=(powercfg /getactivescheme)
$plans=@()
foreach($line in (powercfg /list)){
  if($line -match 'GUID: ([0-9a-f-]+)\\s+\\((.+)\\)'){
    $plans+=[PSCustomObject]@{guid=$Matches[1]; name=$Matches[2].Trim()}
  }
}
$activeGuid=''
if($active -match 'GUID: ([0-9a-f-]+)'){ $activeGuid=$Matches[1] }
[PSCustomObject]@{active=$activeGuid; plans=$plans} | ConvertTo-Json -Compress
`);
  return out ?? { active: "", plans: [] };
}

async function setPowerPlan(guid) {
  const safe = String(guid).replace(/[^0-9a-fA-F-]/g, "");
  const { code, err } = await runPS(`powercfg /setactive ${safe}`);
  return { ok: code === 0, error: err };
}

/** Unlocks the hidden "Ultimate Performance" plan (desktops mainly). */
async function addUltimatePlan() {
  const { code, err } = await runPS(
    "powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61"
  );
  return { ok: code === 0, error: err };
}

// --- per-app GPU preference ------------------------------------------------
/** Tells Windows to run a specific .exe on the high-performance GPU.
 *  Registry: HKCU\Software\Microsoft\DirectX\UserGpuPreferences */
async function setAppGpuPreference(exePath, high = true) {
  const p = String(exePath).replace(/'/g, "''");
  const { code, err } = await runPS(`
$key='HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
if(-not (Test-Path $key)){ New-Item -Path $key -Force | Out-Null }
${high
      ? `Set-ItemProperty -Path $key -Name '${p}' -Value 'GpuPreference=2;' -Type String`
      : `Remove-ItemProperty -Path $key -Name '${p}' -ErrorAction SilentlyContinue`}
`);
  return { ok: code === 0, error: err };
}

async function listAppGpuPreferences() {
  const out = await runPSJson(`
$key='HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
if(Test-Path $key){
  $item=Get-Item $key
  $out=@()
  foreach($n in $item.GetValueNames()){ if($n){ $out+=[PSCustomObject]@{path=$n; value=$item.GetValue($n)} } }
  ConvertTo-Json @($out) -Compress
} else { '[]' }
`);
  return Array.isArray(out) ? out : out ? [out] : [];
}

// --- GPU info + driver age -------------------------------------------------
/** Read-only: which GPUs are installed and how old their drivers are.
 *  Outdated drivers are the most common cause of "my games got slower". */
async function gpuInfo() {
  const r = await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$out=@()
foreach($v in Get-CimInstance Win32_VideoController){
  $date=$null
  if($v.DriverDate){ $date=(Get-Date $v.DriverDate).ToString('yyyy-MM-dd') }
  $out+=[PSCustomObject]@{
    name=$v.Name; driver=$v.DriverVersion; driverDate=$date
    vram=[double]$v.AdapterRAM; status=$v.Status
    errorCode=[int]$v.ConfigManagerErrorCode
  }
}
ConvertTo-Json @($out) -Compress
`);
  const list = Array.isArray(r) ? r : r ? [r] : [];
  return list.map((g) => {
    const ageDays = g.driverDate
      ? Math.round((Date.now() - new Date(g.driverDate).getTime()) / 86400000)
      : null;
    return { ...g, ageDays };
  });
}

// --- PCIe link power management -------------------------------------------
/** Stops Windows dropping the PCIe link to a lower power state, which can cost
 *  frames on desktops. Applies to the ACTIVE power plan only, so switching plans
 *  (or reverting here) puts it straight back. */
async function setPciePowerSaving(on) {
  // 0 = off (maximum performance), 2 = moderate power savings (Windows default)
  const value = on ? 2 : 0;
  const { code, err } = await runPS(`
powercfg -setacvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ee12f906-d277-404b-b6da-e5fa1a576df5 ${value}
powercfg -setdcvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ee12f906-d277-404b-b6da-e5fa1a576df5 ${value}
powercfg -setactive SCHEME_CURRENT
`);
  return { ok: code === 0, error: err };
}

async function getPciePowerSaving() {
  const r = await runPSJson(`
$out=(powercfg -query SCHEME_CURRENT SUB_PCIEXPRESS ee12f906-d277-404b-b6da-e5fa1a576df5) -join "\`n"
$ac=0
if($out -match 'Current AC Power Setting Index:\\s*0x([0-9a-f]+)'){ $ac=[Convert]::ToInt32($Matches[1],16) }
@{saving=$ac} | ConvertTo-Json -Compress
`);
  return { saving: (r?.saving ?? 2) !== 0 };
}

// --- shader caches ---------------------------------------------------------
/** Stale shader caches after a driver update are a common cause of stutter.
 *  Deleting them is safe — games and drivers rebuild them on next launch. */
async function clearShaderCaches() {
  const r = await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$paths=@(
  "$env:LOCALAPPDATA\\D3DSCache",
  "$env:LOCALAPPDATA\\NVIDIA\\DXCache",
  "$env:LOCALAPPDATA\\NVIDIA\\GLCache",
  "$env:LOCALAPPDATA\\NVIDIA Corporation\\NV_Cache",
  "$env:LOCALAPPDATA\\AMD\\DxCache",
  "$env:LOCALAPPDATA\\AMD\\DxcCache",
  "$env:LOCALAPPDATA\\AMD\\GLCache",
  "$env:LOCALAPPDATA\\Intel\\ShaderCache"
)
$bytes=0; $cleared=@()
foreach($p in $paths){
  if(Test-Path $p){
    $size=(Get-ChildItem $p -Recurse -File | Measure-Object Length -Sum).Sum
    Remove-Item "$p\\*" -Recurse -Force
    if($size){ $bytes+=$size }
    $cleared+=(Split-Path $p -Leaf)
  }
}
[PSCustomObject]@{bytes=$bytes; cleared=$cleared} | ConvertTo-Json -Compress
`);
  return r ?? { bytes: 0, cleared: [] };
}

module.exports = {
  listTweaks, applyTweak, RECOMMENDED,
  getPowerPlan, setPowerPlan, addUltimatePlan,
  setAppGpuPreference, listAppGpuPreferences,
  gpuInfo, setPciePowerSaving, getPciePowerSaving, clearShaderCaches,
};
