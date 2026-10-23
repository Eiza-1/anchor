// Performance tweaks for games and heavy apps.
// Every tweak names the exact registry value or Windows call it uses, is read
// back so the UI always shows real state, and is truly reversible: the first
// time a tweak is applied, the values it is about to change are saved, and
// switching it off puts exactly those back (a value that didn't exist is
// deleted again). Tweaks applied before that existed fall back to the Windows
// default. Nothing here touches security features.
const fs = require("fs");
const path = require("path");
const { runPS, runPSJson } = require("./ps");

// What a tweak actually changes, shown as a badge so nobody expects a desktop
// tweak to raise their frame rate.
//   fps        — can raise frame rate, mostly on CPU-limited or busy systems
//   smoothness — frame pacing / tearing, not average FPS
//   latency    — input-to-display delay
//   desktop    — Windows feels faster; games are unaffected

const GAMEDVR = "Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR";
const GAMECONFIG = "System\\GameConfigStore";
const DX = "Software\\Microsoft\\DirectX\\UserGpuPreferences";

// A registry value a tweak sets. `on` is written when applied; `dflt` is what
// Windows behaves as when the value is absent, so a PC that's already set up
// that way shows as applied. `fallback` is written on revert when there's no
// saved original (no fallback = delete the value, i.e. back to the default).
const v = (hive, key, name, on, dflt = null, type = "DWord", fallback) => ({ hive, key, name, on, dflt, type, fallback });

const TWEAKS = [
  {
    id: "gamemode",
    name: "Windows Game Mode",
    desc: "Gives the game you're playing priority for CPU time and stops Windows Update installing drivers or showing restart prompts during play. Helps most on 4-core and older CPUs. On by default; this makes sure it is. Registry: HKCU\\Software\\Microsoft\\GameBar\\AutoGameModeEnabled = 1, AllowAutoGameMode = 1",
    category: "Gaming", effect: "fps", recommended: true,
    values: [
      v("HKCU:", "Software\\Microsoft\\GameBar", "AutoGameModeEnabled", 1, 1),
      v("HKCU:", "Software\\Microsoft\\GameBar", "AllowAutoGameMode", 1, 1),
    ],
  },
  {
    id: "gamecapture",
    name: "Turn off Xbox Game Bar capture",
    desc: "Stops Game Bar's capture service hooking into every game, and background recording if it was ever switched on. Screenshots with Win+PrtScn still work. Registry: HKCU\\System\\GameConfigStore\\GameDVR_Enabled = 0, HKCU\\...\\GameDVR\\AppCaptureEnabled = 0, HistoricalCaptureEnabled = 0",
    category: "Gaming", effect: "fps", recommended: true,
    values: [
      v("HKCU:", GAMECONFIG, "GameDVR_Enabled", 0, 1),
      v("HKCU:", GAMEDVR, "AppCaptureEnabled", 0, 1),
      v("HKCU:", GAMEDVR, "HistoricalCaptureEnabled", 0, 0),
    ],
  },
  {
    id: "bgapps",
    name: "Stop Store apps running in the background",
    desc: "Background Store apps quietly use CPU, RAM and network while you play. Apps still work when you open them. Registry: HKCU\\...\\BackgroundAccessApplications\\GlobalUserDisabled = 1, HKCU\\...\\Search\\BackgroundAppGlobalToggle = 0",
    category: "Gaming", effect: "fps", recommended: true,
    values: [
      v("HKCU:", "Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications", "GlobalUserDisabled", 1, 0),
      v("HKCU:", "Software\\Microsoft\\Windows\\CurrentVersion\\Search", "BackgroundAppGlobalToggle", 0, 1),
    ],
  },
  {
    id: "hags",
    name: "Hardware-accelerated GPU scheduling",
    desc: "Lets the GPU manage its own work queue, trimming latency and CPU overhead. Only offered when your graphics driver supports it. Needs a restart. Registry: HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers\\HwSchMode = 2",
    category: "Graphics", effect: "latency", needsRestart: true, requires: "hags",
    values: [v("HKLM:", "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", "HwSchMode", 2)],
  },
  {
    id: "swapchain",
    name: "Optimizations for windowed games",
    desc: "Upgrades older DirectX games to the modern flip model, so borderless-windowed play gets fullscreen-level latency and frame rate. Same switch as Settings > Display > Graphics. Registry: HKCU\\...\\DirectX\\UserGpuPreferences\\DirectXUserGlobalSettings → SwapEffectUpgradeEnable=1",
    category: "Graphics", effect: "latency", recommended: true,
    flag: { hive: "HKCU:", key: DX, name: "DirectXUserGlobalSettings", flag: "SwapEffectUpgradeEnable", on: "1" },
  },
  {
    id: "vrr",
    name: "Variable refresh rate for all games",
    desc: "Lets G-Sync / FreeSync smooth out games that don't support it themselves, removing tearing and stutter when FPS drops below your refresh rate. Needs a VRR-capable display; does nothing otherwise. Registry: DirectXUserGlobalSettings → VRROptimizeEnable=1",
    category: "Graphics", effect: "smoothness",
    flag: { hive: "HKCU:", key: DX, name: "DirectXUserGlobalSettings", flag: "VRROptimizeEnable", on: "1" },
  },
  {
    id: "fse",
    name: "Disable fullscreen optimizations",
    desc: "Makes 'fullscreen' games use true exclusive fullscreen instead of Windows' borderless version. Can lower latency in older DirectX 9–11 games; newer games usually see no difference, and Alt-Tab gets slower. Try it if a specific game feels laggy. Registry: HKCU\\System\\GameConfigStore — GameDVR_FSEBehaviorMode = 2, GameDVR_FSEBehavior = 2, GameDVR_HonorUserFSEBehaviorMode = 1, GameDVR_DXGIHonorFSEWindowsCompatible = 1",
    category: "Graphics", effect: "latency",
    values: [
      v("HKCU:", GAMECONFIG, "GameDVR_FSEBehaviorMode", 2, 0),
      v("HKCU:", GAMECONFIG, "GameDVR_FSEBehavior", 2, 0),
      v("HKCU:", GAMECONFIG, "GameDVR_HonorUserFSEBehaviorMode", 1, 0),
      v("HKCU:", GAMECONFIG, "GameDVR_DXGIHonorFSEWindowsCompatible", 1, 0),
    ],
  },
  {
    id: "visualfx",
    name: "Reduce animations and visual effects",
    desc: "Turns off window, menu and taskbar animations, applied immediately through the same Windows calls as System Properties > Performance Options. Font smoothing stays on. The desktop feels snappier; games are unaffected.",
    category: "Desktop", effect: "desktop", special: "visualfx",
  },
  {
    id: "transparency",
    name: "Disable transparency effects",
    desc: "Turns off the blur behind the taskbar, Start and Windows menus. Saves a little GPU time on integrated graphics while you're on the desktop. Registry: HKCU\\...\\Themes\\Personalize\\EnableTransparency = 0",
    category: "Desktop", effect: "desktop", refresh: "theme",
    values: [v("HKCU:", "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "EnableTransparency", 0, 1, "DWord", 1)],
  },
  {
    id: "menudelay",
    name: "Instant menus",
    desc: "Removes the built-in pause before submenus open. Registry: HKCU\\Control Panel\\Desktop\\MenuShowDelay = 0 (Windows default 400 ms)",
    category: "Desktop", effect: "desktop", refresh: "menu",
    values: [v("HKCU:", "Control Panel\\Desktop", "MenuShowDelay", "0", "400", "String", "400")],
  },
  {
    id: "startupdelay",
    name: "Remove the startup app delay",
    desc: "Windows holds startup apps back for about 10 seconds after you sign in. Takes effect at your next sign-in. Registry: HKCU\\...\\Explorer\\Serialize\\StartupDelayInMSec = 0, WaitForIdleState = 0",
    category: "Desktop", effect: "desktop",
    values: [
      v("HKCU:", "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "StartupDelayInMSec", 0),
      v("HKCU:", "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "WaitForIdleState", 0),
    ],
  },
  // Retired: not shown, but Revert all still undoes them on PCs where an
  // older Anchor applied them. Disabling MPO through OverlayTestMode no longer
  // works on Windows 11 24H2 and later.
  {
    id: "mpo", legacy: true, name: "Disable Multi-Plane Overlay",
    values: [v("HKLM:", "SOFTWARE\\Microsoft\\Windows\\Dwm", "OverlayTestMode", 5)],
  },
];

const RECOMMENDED = TWEAKS.filter((t) => t.recommended).map((t) => t.id);

/* ------------------------------- backups --------------------------------- */
// %APPDATA%\Anchor\perf-backup.json — what each tweak replaced, plus the power
// plan and PCIe setting from before Anchor first changed them.
function backupFile() {
  if (process.env.ANCHOR_PERF_BACKUP) return process.env.ANCHOR_PERF_BACKUP;
  const { app } = require("electron");
  return path.join(app.getPath("userData"), "perf-backup.json");
}
function loadBackup() {
  try {
    const b = JSON.parse(fs.readFileSync(backupFile(), "utf8"));
    return { tweaks: b.tweaks ?? {}, powerPlan: b.powerPlan ?? null, pcie: b.pcie ?? null };
  } catch {
    return { tweaks: {}, powerPlan: null, pcie: null };
  }
}
function saveBackup(b) {
  fs.mkdirSync(path.dirname(backupFile()), { recursive: true });
  fs.writeFileSync(backupFile(), JSON.stringify(b, null, 2));
}

/* --------------------------- PowerShell helpers --------------------------- */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const regPath = (x) => q(`${x.hive}\\${x.key}`);

// Reads a value as {e: exists, v: value, t: kind}.
const PS_READ = `
function Get-AnchorReg($k, $n) {
  $i = Get-Item -LiteralPath $k -ErrorAction SilentlyContinue
  if ($i -and ($i.GetValueNames() -contains $n)) { @{ e = $true; v = $i.GetValue($n); t = [string]$i.GetValueKind($n) } }
  else { @{ e = $false; v = $null; t = $null } }
}`;
const PS_WRITE = `
function Set-AnchorReg($k, $n, $v, $t) {
  if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
  New-ItemProperty -LiteralPath $k -Name $n -Value $v -PropertyType $t -Force -ErrorAction Stop | Out-Null
}
function Remove-AnchorReg($k, $n) { Remove-ItemProperty -LiteralPath $k -Name $n -ErrorAction SilentlyContinue }`;

// SystemParametersInfo + the settings-changed broadcast, for effects Windows
// only picks up through its API (a registry write alone isn't read back).
const PS_SPI = `
if (-not ('Anchor.Spi' -as [type])) {
  Add-Type -Namespace Anchor -Name Spi -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint a, uint u, ref int p, uint f);
[DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint a, uint u, IntPtr p, uint f);
[DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint a, uint u, int[] p, uint f);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, string l, uint f, uint t, out UIntPtr r);
'@
}
function GetBool($get) { $x = 0; [void][Anchor.Spi]::SystemParametersInfo($get, 0, [ref]$x, 0); [int]($x -ne 0) }
function SetBool($set, $on) { [void][Anchor.Spi]::SystemParametersInfo($set, 0, [IntPtr][int]$on, 3) }
function GetMinAnimate { $a = [int[]](8, 0); [void][Anchor.Spi]::SystemParametersInfo(0x48, 8, $a, 0); $a[1] }
function SetMinAnimate($on) { $a = [int[]](8, [int]$on); [void][Anchor.Spi]::SystemParametersInfo(0x49, 8, $a, 3) }
function Broadcast($what) { $r = [UIntPtr]::Zero; [void][Anchor.Spi]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, $what, 2, 3000, [ref]$r) }`;

// Graphics kernel (D3DKMT) query: the driver's own numbers for VRAM — what
// Task Manager and DXGI report — plus GPU-scheduling support. WMI's AdapterRAM
// is a 32-bit field that integrated GPUs fill with a placeholder (often 1 GB).
const PS_KMT = `
if (-not ('Anchor.Kmt' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace Anchor {
  public class Gpu { public string Name; public long Dedicated; public long Shared; public bool HwSchSupported; public bool HwSchEnabled; }
  public static class Kmt {
    [StructLayout(LayoutKind.Sequential)] struct LUID { public uint Low; public int High; }
    [StructLayout(LayoutKind.Sequential)] struct ADAPTERINFO { public uint hAdapter; public LUID Luid; public uint NumOfSources; public int bPrecise; }
    [StructLayout(LayoutKind.Sequential)] struct ENUM2 { public uint NumAdapters; public IntPtr pAdapters; }
    [StructLayout(LayoutKind.Sequential)] struct QUERY { public uint hAdapter; public int Type; public IntPtr pData; public uint Size; }
    [StructLayout(LayoutKind.Sequential)] struct CLOSE { public uint hAdapter; }
    [DllImport("gdi32.dll")] static extern int D3DKMTEnumAdapters2(ref ENUM2 e);
    [DllImport("gdi32.dll")] static extern int D3DKMTQueryAdapterInfo(ref QUERY q);
    [DllImport("gdi32.dll")] static extern int D3DKMTCloseAdapter(ref CLOSE c);
    static int Query(uint h, int type, IntPtr buf, uint size) { var q = new QUERY { hAdapter = h, Type = type, pData = buf, Size = size }; return D3DKMTQueryAdapterInfo(ref q); }
    public static Gpu[] Read() {
      var list = new List<Gpu>();
      var e = new ENUM2();
      if (D3DKMTEnumAdapters2(ref e) != 0 || e.NumAdapters == 0) return list.ToArray();
      int sz = Marshal.SizeOf(typeof(ADAPTERINFO));
      e.pAdapters = Marshal.AllocHGlobal(sz * (int)e.NumAdapters);
      IntPtr buf = Marshal.AllocHGlobal(4096);
      try {
        if (D3DKMTEnumAdapters2(ref e) != 0) return list.ToArray();
        for (int i = 0; i < e.NumAdapters; i++) {
          var a = (ADAPTERINFO)Marshal.PtrToStructure(new IntPtr(e.pAdapters.ToInt64() + i * sz), typeof(ADAPTERINFO));
          try {
            // KMTQAITYPE_ADAPTERTYPE (15): bit 2 = software device (Microsoft Basic Render Driver)
            if (Query(a.hAdapter, 15, buf, 4) == 0 && (Marshal.ReadInt32(buf) & 4) != 0) continue;
            // KMTQAITYPE_ADAPTERREGISTRYINFO (8): adapter name
            if (Query(a.hAdapter, 8, buf, 2080) != 0) continue;
            var g = new Gpu { Name = Marshal.PtrToStringUni(buf) };
            // KMTQAITYPE_GETSEGMENTSIZE (3): dedicated video, dedicated system, shared system
            if (Query(a.hAdapter, 3, buf, 24) == 0) { g.Dedicated = Marshal.ReadInt64(buf, 0) + Marshal.ReadInt64(buf, 8); g.Shared = Marshal.ReadInt64(buf, 16); }
            // KMTQAITYPE_WDDM_2_7_CAPS (70): bit 0 HwSchSupported, bit 1 HwSchEnabled
            if (Query(a.hAdapter, 70, buf, 4) == 0) { int c = Marshal.ReadInt32(buf); g.HwSchSupported = (c & 1) != 0; g.HwSchEnabled = (c & 2) != 0; }
            list.Add(g);
          } finally { var c = new CLOSE { hAdapter = a.hAdapter }; D3DKMTCloseAdapter(ref c); }
        }
      } finally { Marshal.FreeHGlobal(buf); Marshal.FreeHGlobal(e.pAdapters); }
      return list.ToArray();
    }
  }
}
'@
}`;

/** The driver's view of each GPU; [] if the query isn't available. */
async function readKmt() {
  const r = await runPSJson(`${PS_KMT}\nConvertTo-Json -Compress -InputObject @([Anchor.Kmt]::Read())`);
  return (Array.isArray(r) ? r : r ? [r] : []).map((g) => ({
    name: g.Name, dedicated: g.Dedicated, shared: g.Shared,
    hwSchSupported: !!g.HwSchSupported, hwSchEnabled: !!g.HwSchEnabled,
  }));
}

/* ------------------------------ flag strings ------------------------------ */
/** DirectX settings share one string like "SwapEffectUpgradeEnable=1;VRROptimizeEnable=0;". */
function parseFlags(s) {
  const map = {};
  for (const part of String(s ?? "").split(";")) {
    const [k, val] = part.split("=");
    if (k && k.trim()) map[k.trim()] = (val ?? "").trim();
  }
  return map;
}
const serializeFlags = (map) => Object.entries(map).map(([k, val]) => `${k}=${val}`).join(";") + ";";

/* ------------------------------ reading state ----------------------------- */
const VISUALFX_KEYS = {
  taskbar: { hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", name: "TaskbarAnimations" },
  fx: { hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects", name: "VisualFXSetting" },
};
// SPI_GETUIEFFECTS 0x103E (menus, tooltips, combo boxes, cursor shadow…),
// SPI_GETCLIENTAREAANIMATION 0x1042, SPI_GETANIMATION 0x48 (minimize/maximize)
const PS_VISUALFX_STATE = `@{ ui = (GetBool 0x103E); client = (GetBool 0x1042); min = (GetMinAnimate)
  taskbar = (Get-AnchorReg ${regPath(VISUALFX_KEYS.taskbar)} ${q(VISUALFX_KEYS.taskbar.name)}); fx = (Get-AnchorReg ${regPath(VISUALFX_KEYS.fx)} ${q(VISUALFX_KEYS.fx.name)}) }`;

/** Every registry value and flag the tweaks use, read in one PowerShell call. */
async function readAll() {
  const lines = [];
  TWEAKS.forEach((t, i) => {
    if (t.values) lines.push(`'${t.id}' = @(${t.values.map((x) => `(Get-AnchorReg ${regPath(x)} ${q(x.name)})`).join(", ")})`);
    else if (t.flag) lines.push(`'${t.id}' = (Get-AnchorReg ${regPath(t.flag)} ${q(t.flag.name)})`);
    else if (t.special === "visualfx") lines.push(`'${t.id}' = ${PS_VISUALFX_STATE}`);
  });
  const r = await runPSJson(`${PS_READ}\n${PS_SPI}\n@{\n${lines.join("\n")}\n} | ConvertTo-Json -Compress -Depth 5`);
  return r ?? {};
}

const asArray = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

function isApplied(t, raw) {
  if (raw == null) return false;
  if (t.values) {
    const vals = asArray(raw);
    return t.values.every((x, i) => {
      const cur = vals[i]?.e ? vals[i].v : x.dflt;
      return cur != null && String(cur) === String(x.on);
    });
  }
  if (t.flag) return parseFlags(raw.e ? raw.v : "")[t.flag.flag] === t.flag.on;
  if (t.special === "visualfx") return raw.ui === 0 && raw.client === 0 && raw.min === 0;
  return false;
}

async function listTweaks() {
  const [raw, kmt] = await Promise.all([readAll(), readKmt()]);
  const hags = {
    supported: kmt.some((g) => g.hwSchSupported),
    enabled: kmt.some((g) => g.hwSchEnabled),
  };
  const backup = loadBackup();
  return TWEAKS.map((t) => {
    const applied = isApplied(t, raw[t.id]);
    const supported = t.requires === "hags" ? hags.supported : true;
    // a restart is due when what's set differs from what the driver is doing
    const pendingRestart = t.id === "hags" && supported && applied !== hags.enabled;
    return {
      id: t.id, name: t.name, desc: t.desc ?? "", category: t.category ?? "", effect: t.effect ?? "desktop",
      needsRestart: !!t.needsRestart, recommended: !!t.recommended,
      applied, supported, hidden: !!t.legacy || !supported, pendingRestart,
      hasBackup: !!backup.tweaks[t.id],
    };
  });
}

/* ------------------------------ apply / revert ---------------------------- */
const fail = (error) => ({ ok: false, error });

async function applyTweak(id, on) {
  const t = TWEAKS.find((x) => x.id === id);
  if (!t) return fail("Unknown tweak");
  try {
    return on ? await turnOn(t) : await turnOff(t);
  } catch (e) {
    return fail(String(e?.message ?? e));
  }
}

async function turnOn(t) {
  const backup = loadBackup();
  if (!backup.tweaks[t.id]) {
    // save what's there now, before the first change
    const raw = (await readAll())[t.id];
    if (raw === undefined) return fail("Couldn't read the current setting, so nothing was changed.");
    backup.tweaks[t.id] = t.flag ? { flag: parseFlags(raw?.e ? raw.v : "")[t.flag.flag] ?? null } : raw;
    saveBackup(backup);
  }
  let script;
  if (t.values) {
    script = t.values.map((x) => `Set-AnchorReg ${regPath(x)} ${q(x.name)} ${q(x.on)} ${x.type}`).join("\n");
  } else if (t.flag) {
    script = flagScript(t.flag, t.flag.on);
  } else if (t.special === "visualfx") {
    // SPI_SETUIEFFECTS 0x103F, SPI_SETCLIENTAREAANIMATION 0x1043; VisualFXSetting 3 = "Custom"
    script = `SetBool 0x103F 0; SetBool 0x1043 0; SetMinAnimate 0
Set-AnchorReg ${regPath(VISUALFX_KEYS.taskbar)} 'TaskbarAnimations' 0 DWord
Set-AnchorReg ${regPath(VISUALFX_KEYS.fx)} 'VisualFXSetting' 3 DWord
Broadcast 'WindowMetrics'`;
  }
  return run(t, script);
}

async function turnOff(t) {
  const backup = loadBackup();
  const saved = backup.tweaks[t.id];
  let script;
  if (t.values) {
    const vals = asArray(saved);
    script = t.values.map((x, i) => {
      const old = saved ? vals[i] : null;
      if (old?.e) return `Set-AnchorReg ${regPath(x)} ${q(x.name)} ${q(old.v)} ${old.t || x.type}`;
      if (!saved && x.fallback !== undefined) return `Set-AnchorReg ${regPath(x)} ${q(x.name)} ${q(x.fallback)} ${x.type}`;
      return `Remove-AnchorReg ${regPath(x)} ${q(x.name)}`;
    }).join("\n");
  } else if (t.flag) {
    script = flagScript(t.flag, saved ? saved.flag : null);
  } else if (t.special === "visualfx") {
    const s = saved ?? { ui: 1, client: 1, min: 1, taskbar: { e: false }, fx: { e: false } };
    const restore = (k, x) => (x?.e ? `Set-AnchorReg ${regPath(k)} ${q(k.name)} ${q(x.v)} ${x.t || "DWord"}` : `Remove-AnchorReg ${regPath(k)} ${q(k.name)}`);
    script = `SetBool 0x103F ${s.ui}; SetBool 0x1043 ${s.client}; SetMinAnimate ${s.min}
${restore(VISUALFX_KEYS.taskbar, s.taskbar)}
${restore(VISUALFX_KEYS.fx, s.fx)}
Broadcast 'WindowMetrics'`;
  }
  const r = await run(t, script);
  if (r.ok && saved) {
    const b = loadBackup();
    delete b.tweaks[t.id];
    saveBackup(b);
  }
  return r;
}

/** Sets one flag inside the shared DirectX string (null removes it), keeping the others. */
function flagScript(f, value) {
  return `
$cur = Get-AnchorReg ${regPath(f)} ${q(f.name)}
$map = [ordered]@{}
if ($cur.e) { foreach ($p in ([string]$cur.v -split ';')) { $kv = $p -split '=', 2; if ($kv[0].Trim()) { $map[$kv[0].Trim()] = $(if ($kv.Count -gt 1) { $kv[1].Trim() } else { '' }) } } }
${value == null ? `$map.Remove(${q(f.flag)})` : `$map[${q(f.flag)}] = ${q(value)}`}
if ($map.Count) { Set-AnchorReg ${regPath(f)} ${q(f.name)} ((($map.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ';') + ';') String }
else { Remove-AnchorReg ${regPath(f)} ${q(f.name)} }`;
}

async function run(t, script) {
  const after =
    t.refresh === "theme" ? "Broadcast 'ImmersiveColorSet'"
    : t.refresh === "menu" ? "[void][Anchor.Spi]::SystemParametersInfo(0x6B, [uint32](Get-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Desktop').MenuShowDelay, [IntPtr]::Zero, 2)"
    : "";
  const { code, err } = await runPS(`$ErrorActionPreference = 'Stop'\n${PS_READ}\n${PS_WRITE}\n${PS_SPI}\n${script}\n${after}`);
  return { ok: code === 0, error: err };
}

/** Puts every applied tweak, the power plan and the PCIe setting back. */
async function revertAll() {
  const list = await listTweaks();
  const backup = loadBackup();
  const results = [];
  for (const t of list) {
    if (!t.applied && !backup.tweaks[t.id]) continue;
    if (t.id === "gamemode" && !backup.tweaks[t.id]) continue; // on is the Windows default
    results.push({ name: t.name, ...(await applyTweak(t.id, false)) });
  }
  if (backup.powerPlan) results.push({ name: "Power plan", ...(await restorePowerPlan()) });
  if (backup.pcie) results.push({ name: "PCIe link speed", ...(await setPciePowerSaving(true)) });
  return results;
}

/* ------------------------------- power plans ------------------------------ */
const ULTIMATE = "e9a42b02-d5df-448d-aa00-03f14749eb61";

async function getPowerPlan() {
  const out = await runPSJson(`
$active = (powercfg /getactivescheme) -join ' '
$plans = @()
foreach ($line in (powercfg /list)) {
  if ($line -match 'GUID: ([0-9a-f-]+)\\s+\\((.+)\\)') { $plans += [PSCustomObject]@{ guid = $Matches[1]; name = $Matches[2].Trim() } }
}
$activeGuid = ''
if ($active -match 'GUID: ([0-9a-f-]+)') { $activeGuid = $Matches[1] }
# the Ultimate template's name in this Windows language, to spot its copies
$ult = 'Ultimate Performance'
$t = (powercfg /query ${ULTIMATE} 2>$null | Select-Object -First 1)
if ($t -match '\\((.+)\\)') { $ult = $Matches[1].Trim() }
[PSCustomObject]@{ active = $activeGuid; plans = @($plans); ultimateName = $ult } | ConvertTo-Json -Compress -Depth 3
`);
  const plans = asArray(out?.plans);
  const ultimate = plans.filter((p) => p.guid === ULTIMATE || p.name === out?.ultimateName);
  return { active: out?.active ?? "", plans, ultimateCopies: ultimate.length };
}

const safeGuid = (g) => String(g).replace(/[^0-9a-fA-F-]/g, "");

async function rememberPowerPlan() {
  const b = loadBackup();
  if (b.powerPlan) return;
  const { active } = await getPowerPlan();
  if (active) { b.powerPlan = active; saveBackup(b); }
}

async function setPowerPlan(guid) {
  await rememberPowerPlan();
  const { code, err } = await runPS(`powercfg /setactive ${safeGuid(guid)}`);
  return { ok: code === 0, error: err };
}

async function restorePowerPlan() {
  const b = loadBackup();
  if (!b.powerPlan) return { ok: true, error: "" };
  const { plans } = await getPowerPlan();
  if (plans.some((p) => p.guid === b.powerPlan)) {
    const { code, err } = await runPS(`powercfg /setactive ${safeGuid(b.powerPlan)}`);
    if (code !== 0) return { ok: false, error: err };
  }
  delete b.powerPlan;
  saveBackup(b);
  return { ok: true, error: "" };
}

/** Adds the hidden Ultimate Performance plan — once. If a copy exists, nothing is added. */
async function addUltimatePlan() {
  const { ultimateCopies } = await getPowerPlan();
  if (ultimateCopies > 0) return { ok: true, error: "", existed: true };
  const { code, err } = await runPS(`powercfg -duplicatescheme ${ULTIMATE}`);
  return code === 0
    ? { ok: true, error: "", existed: false }
    : { ok: false, error: err || "This edition of Windows doesn't offer the Ultimate Performance plan." };
}

/** Deletes extra Ultimate Performance copies (older Anchor versions added one per click). Keeps the active one. */
async function removeDuplicateUltimate() {
  const { active, plans } = await getPowerPlan();
  const { ultimateName } = (await runPSJson(`
$ult = 'Ultimate Performance'
$t = (powercfg /query ${ULTIMATE} 2>$null | Select-Object -First 1)
if ($t -match '\\((.+)\\)') { $ult = $Matches[1].Trim() }
@{ ultimateName = $ult } | ConvertTo-Json -Compress`)) ?? { ultimateName: "Ultimate Performance" };
  const copies = plans.filter((p) => p.guid !== ULTIMATE && p.name === ultimateName);
  const keep = copies.find((p) => p.guid === active) ?? copies[0];
  const extra = copies.filter((p) => p !== keep);
  if (!extra.length) return { ok: true, error: "", removed: 0 };
  const { code, err } = await runPS(extra.map((p) => `powercfg /delete ${safeGuid(p.guid)}`).join("\n"));
  return { ok: code === 0, error: err, removed: extra.length };
}

/* ------------------------- per-app GPU preference ------------------------- */
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
  foreach($n in $item.GetValueNames()){ if($n -and $n -ne 'DirectXUserGlobalSettings'){ $out+=[PSCustomObject]@{path=$n; value=$item.GetValue($n)} } }
  ConvertTo-Json @($out) -Compress
} else { '[]' }
`);
  return Array.isArray(out) ? out : out ? [out] : [];
}

/* --------------------------- GPU info + driver age ------------------------ */
/** Read-only: installed GPUs, real memory sizes and driver age.
 *  Outdated drivers are the most common cause of "my games got slower". */
async function gpuInfo() {
  const [wmi, kmt] = await Promise.all([
    runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$out=@()
foreach($v in Get-CimInstance Win32_VideoController){
  $date=$null
  if($v.DriverDate){ $date=(Get-Date $v.DriverDate).ToString('yyyy-MM-dd') }
  $out+=[PSCustomObject]@{ name=$v.Name; driver=$v.DriverVersion; driverDate=$date; status=$v.Status; errorCode=[int]$v.ConfigManagerErrorCode }
}
ConvertTo-Json @($out) -Compress
`),
    readKmt(),
  ]);
  return asArray(wmi).map((g) => {
    const k = kmt.find((x) => x.name === g.name);
    const ageDays = g.driverDate ? Math.round((Date.now() - new Date(g.driverDate).getTime()) / 86400000) : null;
    return {
      ...g, ageDays,
      // null = unknown; never fall back to WMI's AdapterRAM, which is wrong for integrated GPUs
      dedicated: k ? k.dedicated : null,
      shared: k ? k.shared : null,
      hwSchSupported: k ? k.hwSchSupported : null,
    };
  });
}

/* ------------------------ PCIe link power management ---------------------- */
// SUB_PCIEXPRESS / ASPM. 0 = Off (full link speed), 1 = Moderate power savings,
// 2 = Maximum power savings. Only the plugged-in (AC) value is changed, so a
// laptop's battery life is untouched. Applies to the active power plan.
const ASPM = "SUB_PCIEXPRESS ee12f906-d277-404b-b6da-e5fa1a576df5";

async function readAspm() {
  const r = await runPSJson(`
$out = (powercfg -query SCHEME_CURRENT ${ASPM}) -join "\`n"
$ac = $null
if ($out -match 'Current AC Power Setting Index:\\s*0x([0-9a-f]+)') { $ac = [Convert]::ToInt32($Matches[1], 16) }
$active = ''
if (((powercfg /getactivescheme) -join ' ') -match 'GUID: ([0-9a-f-]+)') { $active = $Matches[1] }
@{ ac = $ac; scheme = $active } | ConvertTo-Json -Compress
`);
  return { ac: r?.ac ?? null, scheme: r?.scheme ?? "" };
}

async function getPciePowerSaving() {
  const { ac } = await readAspm();
  return { saving: ac !== 0 };
}

/** on = power saving (back to what it was), off = full link speed. */
async function setPciePowerSaving(on) {
  const b = loadBackup();
  let value = 0;
  if (on) {
    // the saved value if it belongs to this plan, else Windows' Balanced default
    const { scheme } = await readAspm();
    value = b.pcie && b.pcie.scheme === scheme ? b.pcie.ac : 1;
  } else if (!b.pcie) {
    const cur = await readAspm();
    if (cur.ac !== null && cur.ac !== 0) { b.pcie = cur; saveBackup(b); }
  }
  const { code, err } = await runPS(`
powercfg -setacvalueindex SCHEME_CURRENT ${ASPM} ${Number(value) || 0}
powercfg -setactive SCHEME_CURRENT
`);
  if (code === 0 && on && b.pcie) { delete b.pcie; saveBackup(b); }
  return { ok: code === 0, error: err };
}

/* ------------------------------ shader caches ----------------------------- */
/** Stale shader caches after a driver update are a common cause of stutter.
 *  Deleting them is safe — games and drivers rebuild them on next launch.
 *  Reports what was actually freed (files in use by a running game stay). */
async function clearShaderCaches() {
  const r = await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$low = Join-Path $env:USERPROFILE 'AppData\\LocalLow'
$paths=[ordered]@{
  'DirectX' = "$env:LOCALAPPDATA\\D3DSCache"
  'NVIDIA DirectX' = "$env:LOCALAPPDATA\\NVIDIA\\DXCache"
  'NVIDIA OpenGL' = "$env:LOCALAPPDATA\\NVIDIA\\GLCache"
  'NVIDIA (per driver) DirectX' = "$low\\NVIDIA\\PerDriverVersion\\DXCache"
  'NVIDIA (per driver) OpenGL' = "$low\\NVIDIA\\PerDriverVersion\\GLCache"
  'NVIDIA compute' = "$env:LOCALAPPDATA\\NVIDIA Corporation\\NV_Cache"
  'AMD DirectX' = "$env:LOCALAPPDATA\\AMD\\DxCache"
  'AMD DirectX 12' = "$env:LOCALAPPDATA\\AMD\\DxcCache"
  'AMD Vulkan' = "$env:LOCALAPPDATA\\AMD\\VkCache"
  'AMD OpenGL' = "$env:LOCALAPPDATA\\AMD\\GLCache"
  'Intel' = "$env:LOCALAPPDATA\\Intel\\ShaderCache"
  'Intel (LocalLow)' = "$low\\Intel\\ShaderCache"
}
function Size($p) { $s = (Get-ChildItem -LiteralPath $p -Recurse -File -Force | Measure-Object Length -Sum).Sum; if ($s) { [double]$s } else { 0 } }
$bytes=0; $cleared=@()
foreach($e in $paths.GetEnumerator()){
  $p = $e.Value
  if(Test-Path -LiteralPath $p){
    $before = Size $p
    if ($before -le 0) { continue }
    Get-ChildItem -LiteralPath $p -Force | Remove-Item -Recurse -Force
    $freed = $before - (Size $p)
    if ($freed -gt 0) { $bytes += $freed; $cleared += $e.Key }
  }
}
[PSCustomObject]@{bytes=$bytes; cleared=@($cleared)} | ConvertTo-Json -Compress
`, { long: true });
  return { bytes: r?.bytes ?? 0, cleared: asArray(r?.cleared) };
}

module.exports = {
  listTweaks, applyTweak, revertAll, RECOMMENDED,
  getPowerPlan, setPowerPlan, addUltimatePlan, removeDuplicateUltimate,
  setAppGpuPreference, listAppGpuPreferences,
  gpuInfo, setPciePowerSaving, getPciePowerSaving, clearShaderCaches,
  // for tests
  _internal: { TWEAKS, parseFlags, serializeFlags, isApplied, readAll, restorePowerPlan },
};
