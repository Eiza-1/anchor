// In-app updates via electron-updater, reading GitHub Releases.
// The user gets: check → download (with progress) → restart & install.
// No manual .exe downloading. Release notes come from the release body.
const { autoUpdater } = require("electron-updater");
const { app } = require("electron");

autoUpdater.autoDownload = false;          // never download behind the user's back
autoUpdater.autoInstallOnAppQuit = true;   // if downloaded, apply on next quit
autoUpdater.allowPrerelease = false;

let sendToUI = () => {};
const send = (status, data = {}) => sendToUI({ status, ...data });

function init(webContents) {
  sendToUI = (payload) => {
    if (webContents && !webContents.isDestroyed()) webContents.send("update:event", payload);
  };

  autoUpdater.on("checking-for-update", () => send("checking"));
  autoUpdater.on("update-available", (info) =>
    send("available", { version: info.version, notes: normalizeNotes(info.releaseNotes), date: info.releaseDate })
  );
  autoUpdater.on("update-not-available", (info) => send("current", { version: info.version }));
  autoUpdater.on("download-progress", (p) =>
    send("downloading", { percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond })
  );
  autoUpdater.on("update-downloaded", (info) => send("downloaded", { version: info.version }));
  autoUpdater.on("error", (err) => send("error", { message: String(err?.message ?? err) }));
}

function normalizeNotes(notes) {
  if (!notes) return "";
  if (typeof notes === "string") return notes;
  // array form: [{version, note}]
  return notes.map((n) => n.note ?? "").join("\n\n");
}

const check = () => autoUpdater.checkForUpdates().catch((e) => send("error", { message: String(e?.message ?? e) }));
const download = () => autoUpdater.downloadUpdate().catch((e) => send("error", { message: String(e?.message ?? e) }));
const install = () => autoUpdater.quitAndInstall(false, true);

/** Release notes for the *installed* version + the latest few, for "What's new". */
async function releaseNotes(limit = 5) {
  try {
    const res = await fetch("https://api.github.com/repos/Eiza-1/anchor/releases?per_page=" + limit, {
      headers: { "User-Agent": "Anchor", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const list = await res.json();
    return list
      .filter((r) => !r.draft)
      .map((r) => ({
        version: String(r.tag_name ?? "").replace(/^v\.?/i, ""),
        name: r.name ?? r.tag_name,
        date: r.published_at,
        notes: r.body ?? "",
        url: r.html_url,
        isCurrent: String(r.tag_name ?? "").replace(/^v\.?/i, "") === app.getVersion(),
      }));
  } catch {
    return [];
  }
}

module.exports = { init, check, download, install, releaseNotes, currentVersion: () => app.getVersion() };
