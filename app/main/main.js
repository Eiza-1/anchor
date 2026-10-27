const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, protocol, net, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

const boost = require("./services/boost");
const sys = require("./services/system");
const news = require("./services/news");
const profile = require("./services/profile");
const auth = require("./services/auth");
const { createSessionStore, validToken, migrate } = require("./services/session");
const perf = require("./services/perftweaks");
const updater = require("./services/updater");
const { warmUp, shutdown } = require("./services/ps");
const monitor = require("./services/monitor");
const bootwatch = require("./services/bootwatch");
const diagnostics = require("./services/diagnostics");
const diskbench = require("./services/diskbench");
const cleanup = require("./services/cleanup");
const background = require("./services/background");
const games = require("./services/games");
const { seasonFor } = require("./services/season");
const instance = require("./services/instance");
const imgproxy = require("./services/imgproxy");
const { createManualFetch } = require("./services/manualfetch");

let win;
let tray = null;

// `npm run dev` keeps its own data folder (%APPDATA%\Anchor-dev), and with it
// its own single-instance lock: it runs beside an installed Anchor without
// quitting on launch or touching that copy's settings, cache and backups.
if (process.env.VITE_DEV_SERVER_URL) app.setPath("userData", `${app.getPath("userData")}-dev`);

// One Anchor per user: a second launch (shortcut clicked while Anchor sits in
// the tray, or a login launch on top of an open one) hands over and exits, so
// there's never a second tray icon or a second set of PowerShell processes.
// Electron hands over to an Anchor at the same elevation; poke() also reaches
// an elevated one from an unelevated launch (see services/instance.js).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  if (process.argv.includes("--startup")) app.exit(0);
  else instance.poke(app.getPath("userData")).finally(() => app.exit(0));
}
app.on("second-instance", (_e, argv) => {
  if (!argv.includes("--startup")) openWindow();
});

// The logo dresses up for Halloween unless Account → Appearance → "Seasonal
// logos" is off. Other seasons are ready but switched off (ACTIVE in
// services/season.js). The icons ship under main/ because build/ is not
// packaged into the app.
function currentSeason() {
  return profile.loadProfile().seasonalLogos === false ? null : seasonFor(new Date());
}
let season = currentSeason();
const appIcon = () => path.join(__dirname, "assets", "icons", `anchor${season ? `-${season}` : ""}.ico`);

/** Re-checks the date and setting; swaps the window and tray icon and tells the page. */
function refreshSeason() {
  const next = currentSeason();
  if (next === season) return;
  season = next;
  if (win && !win.isDestroyed()) {
    win.setIcon(appIcon());
    win.webContents.send("app:season", season);
  }
  tray?.setImage(appIcon());
}

// anchor-img://fetch?u=<https url>: a news picture fetched by main, readable by
// the page (feeds' image hosts send no CORS headers). The page shrinks it to
// card size once (lib/thumbs.ts) instead of decoding multi-megapixel photos
// while you scroll. Images only, never local/private hosts (services/imgproxy.js).
protocol.registerSchemesAsPrivileged([
  { scheme: "anchor-img", privileges: { supportFetchAPI: true, corsEnabled: true, secure: true } },
]);
// Launched by Windows at login (see setLoginItemSettings) — start in the tray.
const startedHidden = process.argv.includes("--startup");
// Windows matches toasts to the installer's shortcut by this id.
if (process.platform === "win32" && app.isPackaged) app.setAppUserModelId("com.eiza.anchor");

/** Shows the window, un-minimizing it first (show() alone leaves it minimized). */
function bringToFront() {
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}

/** Shows the window, loading it again if it was released while in the tray,
 *  then goes to `target` (a page) if given. */
function openWindow(target) {
  if (bringToFront()) {
    if (target) win.webContents.send("nav:go", target);
    return;
  }
  createWindow({ show: true });
  const contents = win.webContents;
  if (target) contents.once("did-finish-load", () => contents.send("nav:go", target));
}

// In the tray, the hidden window is released (its page, GPU and renderer
// processes, ~300 MB) once nothing is running; opening Anchor loads it again.
// The UI reports running tasks, so a cleanup or update is never cut off.
const RELEASE_MS = 60_000;
let uiBusy = false;
let releaseTimer = null;
function scheduleRelease() {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || win.isVisible() || uiBusy) return;
    monitor.stop(); // its only viewer is the page
    win.releasing = true;
    win.destroy();
  }, RELEASE_MS);
}
ipcMain.on("app:busy", (_e, busy) => {
  uiBusy = !!busy;
  if (!uiBusy && win && !win.isDestroyed() && !win.isVisible()) scheduleRelease();
});
const currentContents = () => (win && !win.isDestroyed() ? win.webContents : null);

// Shown notifications are held here — one only kept in a local can be
// garbage-collected, and its click never fires. Kept past "close" too, since
// Windows closes a toast when it times out into Action Center, where it can
// still be clicked; the oldest are let go after a few.
const notes = new Set();
const MAX_NOTES = 10;
function showNote({ title, body }, target) {
  const note = new Notification({ title, body, icon: appIcon() });
  notes.add(note);
  if (notes.size > MAX_NOTES) notes.delete(notes.values().next().value);
  note.on("click", () => { notes.delete(note); openWindow(target); });
  note.on("failed", () => notes.delete(note));
  note.show();
}

function createWindow({ show }) {
  clearTimeout(releaseTimer);
  uiBusy = false;
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: "#09090b",
    title: "Anchor",
    icon: appIcon(),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#a1a1aa", height: 40 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const w = win;
  w.once("ready-to-show", () => { if (show) w.show(); });

  // Closing to the tray keeps Boot Watch running; Quit from the tray exits.
  w.on("close", (e) => {
    if (!app.isQuitting && tray) { e.preventDefault(); w.hide(); scheduleRelease(); }
  });
  w.on("show", () => clearTimeout(releaseTimer));
  w.on("closed", () => { if (win === w) win = null; });
  // Safety net: never leave the user staring at nothing if the page is slow or fails.
  if (show) setTimeout(() => { if (!w.isDestroyed() && !w.isVisible()) w.show(); }, 4000);

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    w.show();
    dialog.showErrorBox("Anchor couldn't load its interface", `${desc} (${code})\n${url}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    if (w.releasing) return;
    dialog.showErrorBox("Anchor's interface crashed", JSON.stringify(details));
  });
  // Open DevTools in a packaged build with:  Anchor.exe --debug
  if (process.argv.includes("--debug")) win.webContents.openDevTools({ mode: "detach" });

  // External links always open in the user's default browser — never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

function createTray() {
  try { tray = new Tray(appIcon()); } catch { return; }
  tray.setToolTip("Anchor — watching startup activity");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Anchor", click: () => openWindow() },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
    ])
  );
  tray.on("double-click", () => openWindow());
}

// Created in whenReady (safeStorage needs a ready app); the auth handlers only run after that.
let sessionStore = null;

app.whenReady().then(async () => {
  if (!gotLock) return;
  sessionStore = createSessionStore({
    file: path.join(app.getPath("userData"), "session.bin"),
    crypto: safeStorage,
  });
  await migrate(sessionStore, profile); // 1.1.1 kept the token in profile.json
  // Anchor.exe is asInvoker, so a taskbar click on a running Anchor hands over
  // without UAC. A launch with nothing to hand over to relaunches elevated.
  if (app.isPackaged && !process.argv.includes(instance.ELEVATED_FLAG) && !(await instance.isElevated())) {
    app.releaseSingleInstanceLock(); // so the elevated copy gets it
    await instance.relaunchElevated(process.argv.slice(1).filter((a) => a === "--startup"));
    return app.exit(0);
  }
  instance.listen(app.getPath("userData"), () => openWindow());
  protocol.handle("anchor-img", (req) => imgproxy.proxyImage(req, createManualFetch(net, imgproxy.MAX_BYTES)));
  // A login launch waits in the tray without loading the window — the user
  // hasn't asked to see it, and an unopened window still costs ~300 MB.
  if (!startedHidden) {
    createWindow({ show: true });
    warmUp();                     // start the PowerShell host before it's needed
    setTimeout(() => sys.prefetchUpdates(), 4000); // so "Check for updates" answers at once; after the first page's reads
  }
  createTray();
  setInterval(refreshSeason, 60 * 60 * 1000);   // seasons start and end at midnight; an hour late is fine
  updater.init(currentContents);

  // Boot Watch: if the user enabled it, watch process starts and, when launched
  // at login, scan persistence and notify about anything suspicious.
  const prof = profile.loadProfile();
  if (prof.bootWatch) {
    bootwatch.watchProcesses(currentContents);
    if (startedHidden) {
      const findings = await bootwatch.scanPersistence();
      const risky = findings.filter((f) => f.level === "high");
      if (risky.length && Notification.isSupported()) {
        showNote({
          title: `Anchor found ${risky.length} suspicious startup item${risky.length === 1 ? "" : "s"}`,
          body: risky.slice(0, 2).map((f) => f.name).join(", ") + " — click to review.",
        });
      }
    }
  }
  app.on("activate", () => openWindow());
});

app.on("window-all-closed", () => { if (!tray) app.quit(); });
app.on("before-quit", () => {
  app.isQuitting = true;
  shutdown();
  monitor.stop();
  bootwatch.stopWatching();
});

// ---------------- IPC ----------------
const handle = (channel, fn) => ipcMain.handle(channel, (_e, ...args) => fn(...args));

handle("win:minimize", () => win?.minimize());
handle("win:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
handle("win:close", () => win?.close());
handle("app:version", () => app.getVersion());
handle("app:season", () => season);

handle("boost:restorePoint", (desc) => boost.createRestorePoint(desc ?? "Anchor"));
handle("boost:ensureRestorePoint", (desc, minDays) =>
  boost.ensureRestorePoint(desc ?? "Anchor", minDays ?? 7)
);
handle("boost:lastRestorePoint", () => boost.lastRestorePointAgeDays());
handle("boost:trim", () => boost.trimMemory());
handle("boost:system", () => boost.boostSystem());
handle("cleanup:scan", () => cleanup.scan());
handle("cleanup:run", (ids) => cleanup.clean(ids ?? []));
handle("cleanup:quick", () => cleanup.quickClean());

handle("sys:buildInfo", () => sys.buildInfo());
handle("sys:checkUpdates", () => sys.checkUpdates());
handle("sys:prefetchUpdates", () => void sys.prefetchUpdates());
handle("sys:driveHealth", () => sys.driveHealth());
handle("sys:volumes", () => sys.volumes());
handle("sys:isAdmin", () => sys.isAdmin());
handle("sys:deviceHealth", () => sys.deviceHealth());
handle("sys:cpuInfo", () => sys.cpuInfo());
handle("monitor:start", () => monitor.start(win.webContents));
handle("monitor:stop", () => monitor.stop());
handle("sys:perfSample", () => sys.perfSample());
handle("sys:topProcesses", () => sys.topProcesses());
handle("sys:startupList", () => sys.startupList());
handle("sys:startupToggle", (name, scope, enable) => sys.startupToggle(name, scope, enable));
handle("sys:bloatwareList", () => sys.bloatwareList());
handle("sys:bloatwareRemove", (pkgs) => sys.bloatwareRemove(pkgs));
handle("sys:privacyList", () => sys.privacyList());
handle("sys:privacyApply", (id, on) => sys.privacyApply(id, on));
handle("sys:openTool", (id) => sys.openTool(id));

handle("sys:saveAutounattend", async (opts) => {
  const xml = sys.generateAutounattend(opts);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Save Autounattend.xml",
    defaultPath: path.join(app.getPath("documents"), "Autounattend.xml"),
    filters: [{ name: "Windows answer file", extensions: ["xml"] }],
  });
  if (canceled || !filePath) return { ok: false, message: "Cancelled." };
  fs.writeFileSync(filePath, xml, "utf8");
  return { ok: true, message: `Saved to: ${filePath}` };
});

handle("news:feeds", () => ({ articles: Object.keys(news.FEEDS), videos: Object.keys(news.VIDEO_CHANNELS) }));
handle("news:articles", (sources) => news.fetchArticles(sources));
handle("news:videos", () => news.fetchVideos());
handle("news:backfill", (links) => news.backfillImages(links ?? []));
// Same config loading as auth.js: real config.js, else the example (which yields "no-key").
let appConfig;
try { appConfig = require("./config"); } catch { appConfig = require("./config.example"); }
handle("games:releases", () =>
  games.upcomingReleases({
    url: `${appConfig.supabaseUrl}/functions/v1/game-releases`,
    anonKey: appConfig.supabaseAnonKey,
  }));
handle("games:free", () => games.freeGames());

// Tokens never go to the renderer; an upgraded profile.json may still carry empty userId/accessToken keys.
const forRenderer = ({ userId: _u, accessToken: _t, ...rest }) => rest;
handle("profile:load", () => forRenderer(profile.loadProfile()));
// `background` is owned by services/background.js; a stale copy from the UI must not undo a pick/reset.
handle("profile:save", (p) => {
  const { background: _ignored, userId: _u, accessToken: _t, ...rest } = p ?? {};
  const saved = profile.saveProfile(rest);
  refreshSeason();                // "Seasonal logos" may have changed
  return forRenderer(saved);
});
handle("bg:pick", () => background.pickBackground(win));
handle("bg:get", () => background.getBackground());
handle("bg:reset", () => background.resetBackground());
// Keep the session here and hand the renderer only who signed in.
async function adopt({ session, ...user }) {
  await sessionStore.save(session);
  return { ok: true, user };
}
handle("auth:signIn", async (provider) => {
  try {
    return await adopt(await auth.signIn(provider));
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
handle("auth:configured", () => auth.isConfigured());
handle("auth:providers", () => auth.PROVIDERS);
// null = signed out; a throw means the refresh couldn't be tried (offline) and the session is kept.
async function sessionOrReason() {
  try {
    const session = await validToken(sessionStore, auth.refreshSession);
    return session ? { session } : { fail: { ok: false, error: "signed-out" } };
  } catch (e) {
    return { fail: { ok: false, error: `offline: ${e.message}` } };
  }
}
handle("auth:saveSubscription", async (prefs) => {
  const { session, fail } = await sessionOrReason();
  return session ? auth.saveSubscription({ session, prefs }) : fail;
});
handle("auth:deleteSubscription", async () => {
  const { session, fail } = await sessionOrReason();
  return session ? auth.deleteSubscription({ session }) : fail;
});
handle("auth:signOut", async () => {
  // Best effort: leave the mailing lists while we still hold a token, then forget it.
  try {
    const session = await validToken(sessionStore, auth.refreshSession);
    if (session) await auth.deleteSubscription({ session });
  } catch { /* offline: still sign out locally */ }
  await sessionStore.clear();
  return { ok: true };
});
handle("auth:sendEmailCode", async (email) => {
  try {
    await auth.sendEmailCode(email);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
handle("auth:verifyEmailCode", async (email, code) => {
  try {
    return await adopt(await auth.verifyEmailCode(email, code));
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// performance tweaks
handle("perf:list", () => perf.listTweaks());
handle("perf:apply", (id, on) => perf.applyTweak(id, on));
handle("perf:applyRecommended", async () => {
  const results = [];
  for (const id of perf.RECOMMENDED) results.push({ id, ...(await perf.applyTweak(id, true)) });
  return results;
});
handle("perf:powerPlan", () => perf.getPowerPlan());
handle("perf:setPowerPlan", (guid) => perf.setPowerPlan(guid));
handle("perf:addUltimatePlan", () => perf.addUltimatePlan());
handle("perf:removeDuplicateUltimate", () => perf.removeDuplicateUltimate());
handle("perf:revertAll", () => perf.revertAll());
handle("perf:gpuPrefs", () => perf.listAppGpuPreferences());
handle("perf:setGpuPref", (path, high) => perf.setAppGpuPreference(path, high));
handle("perf:gpuInfo", () => perf.gpuInfo());
handle("perf:pcieState", () => perf.getPciePowerSaving());
handle("perf:setPcie", (on) => perf.setPciePowerSaving(on));
handle("perf:clearShaderCaches", () => perf.clearShaderCaches());
handle("perf:pickExe", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Choose a game or app",
    filters: [{ name: "Programs", extensions: ["exe"] }],
    properties: ["openFile"],
  });
  return canceled ? null : filePaths[0];
});

// Disk benchmark + RAM test
handle("bench:run", (drive, sizeMB) => diskbench.benchmark(drive, sizeMB));
handle("bench:memoryResults", () => diskbench.memoryTestResults());
handle("bench:scheduleMemoryTest", () => diskbench.scheduleMemoryTest());

// Diagnostics
handle("diag:state", () => diagnostics.systemState());
handle("diag:processes", () => diagnostics.processSnapshot());
handle("diag:errors", (days) => diagnostics.errorHistory(days ?? 7));
handle("diag:repairs", () => diagnostics.listRepairs());
handle("diag:runRepair", (id) => diagnostics.runRepair(id));
handle("diag:trim", (pid) => diagnostics.trimProcess(pid));
handle("diag:restartService", (name) => diagnostics.restartService(name));

// Boot Watch
handle("bootwatch:scan", () => bootwatch.scanPersistence());
handle("bootwatch:disable", (id) => bootwatch.disableEntry(id));
handle("bootwatch:setEnabled", (on) => {
  profile.saveProfile({ bootWatch: !!on });
  app.setLoginItemSettings({
    openAtLogin: !!on,
    path: process.execPath,
    args: ["--startup"],
  });
  if (on) bootwatch.watchProcesses(currentContents);
  else bootwatch.stopWatching();
  return { ok: true };
});
handle("bootwatch:status", () => ({
  enabled: !!profile.loadProfile().bootWatch,
  openAtLogin: app.getLoginItemSettings({ path: process.execPath, args: ["--startup"] }).openAtLogin,
}));

handle("update:check", () => updater.check());
handle("update:download", () => updater.download());
handle("update:install", () => updater.install());
handle("update:notes", (limit) => updater.releaseNotes(limit));
handle("app:openExternal", (url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});
// Windows notification for a finished task, only when Anchor isn't the focused window.
handle("app:notify", (n) => {
  if (!win || win.isDestroyed() || win.isFocused() || !Notification.isSupported()) return;
  if (!n || typeof n.title !== "string") return;
  showNote({ title: n.title, body: typeof n.body === "string" ? n.body : "" }, n.target);
});
