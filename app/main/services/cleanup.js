// Safe cleanup targets. Each one is scanned for size first so the user chooses
// with real numbers in front of them, and nothing here touches personal files —
// no documents, downloads, pictures, or saved passwords.
const fs = require("fs/promises");
const path = require("path");
const { runPSJson } = require("./ps");

// path expressions are PowerShell; each may match several folders
const TARGETS = [
  {
    id: "temp",
    name: "Temporary files",
    detail: "Leftovers from installers and apps in your temp folders. Windows never cleans these automatically.",
    paths: [`$env:TEMP\\*`, `$env:SystemRoot\\Temp\\*`],
    safe: true,
    default: true,
  },
  {
    id: "updatecache",
    name: "Windows Update downloads",
    detail: "Installers for updates already applied. Windows keeps them indefinitely; deleting them also fixes stuck updates.",
    paths: [`$env:SystemRoot\\SoftwareDistribution\\Download\\*`],
    stopServices: ["wuauserv", "bits"],
    safe: true,
    default: true,
  },
  {
    id: "deliveryopt",
    name: "Delivery Optimization cache",
    detail: "Update files Windows keeps to share with other PCs on your network. Frequently several GB.",
    paths: [`$env:SystemRoot\\SoftwareDistribution\\DeliveryOptimization\\*`, `$env:SystemRoot\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\*`],
    safe: true,
    default: true,
  },
  {
    id: "crashdumps",
    name: "Crash dumps",
    detail: "Memory snapshots written when Windows or an app crashed. A single full dump can be as large as your RAM.",
    paths: [`$env:SystemRoot\\MEMORY.DMP`, `$env:SystemRoot\\Minidump\\*`, `$env:LOCALAPPDATA\\CrashDumps\\*`],
    safe: true,
    default: true,
  },
  {
    id: "wer",
    name: "Error report queue",
    detail: "Crash reports queued for Microsoft. They pile up silently after every app crash.",
    paths: [`$env:ProgramData\\Microsoft\\Windows\\WER\\ReportQueue\\*`, `$env:ProgramData\\Microsoft\\Windows\\WER\\ReportArchive\\*`, `$env:LOCALAPPDATA\\Microsoft\\Windows\\WER\\*`],
    safe: true,
    default: true,
  },
  {
    id: "thumbcache",
    name: "Thumbnail & icon cache",
    detail: "Rebuilt automatically as you browse folders. Clearing also fixes blank or wrong icons.",
    paths: [`$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db`, `$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache_*.db`],
    safe: true,
    default: false,
  },
  {
    id: "inetcache",
    name: "Internet cache (system)",
    detail: "Cached web content used by Windows components and older apps. Not your browser history or logins.",
    paths: [`$env:LOCALAPPDATA\\Microsoft\\Windows\\INetCache\\*`],
    safe: true,
    default: true,
  },
  {
    id: "logs",
    name: "Windows setup & servicing logs",
    detail: "Diagnostic logs from updates and installs. Useful only when troubleshooting a failed upgrade.",
    paths: [`$env:SystemRoot\\Logs\\CBS\\*.log`, `$env:SystemRoot\\Logs\\DISM\\*.log`, `$env:SystemRoot\\Panther\\*.log`, `$env:SystemRoot\\inf\\setupapi*.log`],
    safe: true,
    default: false,
  },
  {
    id: "fontcache",
    name: "Font cache",
    detail: "Rebuilt on next login. Worth clearing if text renders oddly.",
    paths: [`$env:SystemRoot\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache\\*`],
    stopServices: ["FontCache"],
    safe: true,
    default: false,
  },
  {
    id: "browsers",
    name: "Browser caches",
    detail: "Cached images and scripts for Chrome, Edge, Brave and Firefox. Your history, bookmarks and logins are untouched — sites just reload once. Close your browser first.",
    paths: [
      `$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cache\\*`,
      `$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cache\\*`,
      `$env:LOCALAPPDATA\\BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache\\*`,
      `$env:APPDATA\\Mozilla\\Firefox\\Profiles\\*\\cache2\\*`,
    ],
    safe: true,
    default: false,
  },
  {
    id: "shadercache",
    name: "GPU shader caches",
    detail: "DirectX, NVIDIA, AMD and Intel shader caches. Rebuilt on next launch; clearing fixes stutter after a driver update.",
    paths: [
      `$env:LOCALAPPDATA\\D3DSCache\\*`,
      `$env:LOCALAPPDATA\\NVIDIA\\DXCache\\*`,
      `$env:LOCALAPPDATA\\NVIDIA\\GLCache\\*`,
      `$env:LOCALAPPDATA\\AMD\\DxCache\\*`,
      `$env:LOCALAPPDATA\\Intel\\ShaderCache\\*`,
    ],
    safe: true,
    default: false,
  },
  {
    id: "recycle",
    name: "Recycle Bin",
    detail: "Permanently deletes everything currently in the bin.",
    special: "recycle",
    safe: true,
    default: false,
  },
  {
    id: "windowsold",
    name: "Previous Windows installation",
    detail: "The Windows.old folder kept after a major upgrade, often 15–30 GB. Removing it means you can no longer roll back to the previous version.",
    paths: [`$env:SystemDrive\\Windows.old`],
    oneWay: true,
    safe: true,
    default: false,
  },
];

/* ------------------------------ Measuring -------------------------------- *
 * Sizes are measured in Node rather than with Get-ChildItem -Recurse, which is
 * many times slower on folders with lots of small files. Paths use the same
 * PowerShell expressions as TARGETS (for deletion), resolved here.           */

// "$env:LOCALAPPDATA\Foo\*.db" -> absolute path with wildcards left in
const resolveEnv = (expr) =>
  expr.replace(/\$env:(\w+)/gi, (_, name) => process.env[name] ?? process.env[name.toUpperCase()] ?? "");

const wildcard = (seg) =>
  new RegExp("^" + seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");

/** Expands wildcard segments ("Profiles\*\cache2\*") into real paths. */
async function expand(pattern) {
  const parts = pattern.split(/[\\/]+/);
  let found = [parts[0] + path.sep];
  for (const seg of parts.slice(1)) {
    if (!seg) continue;
    const next = [];
    for (const base of found) {
      if (!/[*?]/.test(seg)) { next.push(path.join(base, seg)); continue; }
      const re = wildcard(seg);
      try {
        for (const name of await fs.readdir(base)) if (re.test(name)) next.push(path.join(base, name));
      } catch { /* missing or denied */ }
    }
    found = next;
  }
  return found;
}

// Bounded concurrency keeps huge trees (Windows.old) from exhausting handles.
let active = 0;
const waiting = [];
async function limited(fn) {
  if (active >= 64) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

/** Total bytes of files under p. Links and junctions aren't followed. */
async function sizeOf(p) {
  let st;
  try { st = await limited(() => fs.lstat(p)); } catch { return 0; }
  if (st.isSymbolicLink()) return 0;
  if (!st.isDirectory()) return st.size;
  let entries;
  try { entries = await limited(() => fs.readdir(p)); } catch { return 0; }
  const sizes = await Promise.all(entries.map((e) => sizeOf(path.join(p, e))));
  return sizes.reduce((a, b) => a + b, 0);
}

async function measureTarget(t) {
  const roots = (await Promise.all(t.paths.map((x) => expand(resolveEnv(x))))).flat();
  const sizes = await Promise.all(roots.map(sizeOf));
  return sizes.reduce((a, b) => a + b, 0);
}

async function recycleBinSize() {
  const r = await runPSJson(`
$rb = 0
try {
  $shell = New-Object -ComObject Shell.Application
  foreach ($i in $shell.NameSpace(0xA).Items()) { $rb += $i.Size }
} catch {}
[PSCustomObject]@{ bytes = [int64]$rb } | ConvertTo-Json -Compress`);
  return Number(r?.bytes ?? 0);
}

/** Bytes per target id, all measured in parallel. */
async function measure(targets) {
  const sizes = await Promise.all(
    targets.map((t) => (t.special === "recycle" ? recycleBinSize() : t.paths ? measureTarget(t) : 0))
  );
  return Object.fromEntries(targets.map((t, i) => [t.id, sizes[i]]));
}

/** Measures every target without deleting anything. */
async function scan() {
  const sizes = await measure(TARGETS);
  return TARGETS.map((t) => ({
    id: t.id,
    name: t.name,
    detail: t.detail,
    default: !!t.default,
    oneWay: !!t.oneWay,
    bytes: sizes[t.id] ?? 0,
  }));
}

/** Deletes the chosen targets. Returns how much was actually freed. */
async function clean(ids = []) {
  const chosen = TARGETS.filter((t) => ids.includes(t.id));
  if (chosen.length === 0) return { freed: 0, cleaned: [] };

  // Freed = measured before minus measured after, so files that were in use
  // and couldn't be deleted aren't counted.
  const before = await measure(chosen);
  const services = [...new Set(chosen.flatMap((t) => t.stopServices ?? []))];
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
${services.length ? `Stop-Service ${services.map((s) => `'${s}'`).join(",")} -Force` : ""}

${chosen
  .filter((t) => t.paths)
  .map(
    (t) => `
foreach ($p in @(${t.paths.map((p) => `"${p}"`).join(",")})) {
  Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue
}`
  )
  .join("\n")}

${chosen.some((t) => t.special === "recycle") ? "Clear-RecycleBin -Force -ErrorAction SilentlyContinue" : ""}
${services.length ? `Start-Service ${services.map((s) => `'${s}'`).join(",")}` : ""}
${chosen.some((t) => t.id === "thumbcache") ? "Stop-Process -Name explorer -Force; Start-Sleep -Seconds 1; if (-not (Get-Process explorer -EA SilentlyContinue)) { Start-Process explorer }" : ""}

[PSCustomObject]@{ done = $true } | ConvertTo-Json -Compress
`;

  await runPSJson(script, { long: true }); // a big Windows.old delete runs for minutes
  const after = await measure(chosen);
  const freed = chosen.reduce((sum, t) => sum + Math.max(0, before[t.id] - after[t.id]), 0);
  return { freed, cleaned: chosen.map((t) => t.name) };
}

/** One-click Boost: the default selection, without a scan first. */
const quickClean = () => clean(TARGETS.filter((t) => t.default).map((t) => t.id));

module.exports = { scan, clean, quickClean };
