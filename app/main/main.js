const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

const boost = require("./services/boost");
const sys = require("./services/system");
const news = require("./services/news");
const profile = require("./services/profile");
const auth = require("./services/auth");
const perf = require("./services/perftweaks");
const updater = require("./services/updater");
const { warmUp, shutdown } = require("./services/ps");
const monitor = require("./services/monitor");
const bootwatch = require("./services/bootwatch");
const diagnostics = require("./services/diagnostics");
const diskbench = require("./services/diskbench");
const cleanup = require("./services/cleanup");
const background = require("./services/background");

let win;
let tray = null;
// Launched by Windows at login (see setLoginItemSettings) — start in the tray.
const startedHidden = process.argv.includes("--startup");

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: "#09090b",
    title: "Anchor",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#a1a1aa", height: 40 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => { if (!startedHidden) win.show(); });

  // Closing to the tray keeps Boot Watch running; Quit from the tray exits.
  win.on("close", (e) => {
    if (!app.isQuitting && tray) { e.preventDefault(); win.hide(); }
  });
  // Safety net: never leave the user staring at nothing if the page is slow or fails.
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show(); }, 4000);

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    win.show();
    dialog.showErrorBox("Anchor couldn't load its interface", `${desc} (${code})\n${url}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
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
  const icon = path.join(__dirname, "..", "build", "icon.ico");
  try { tray = new Tray(icon); } catch { return; }
  tray.setToolTip("Anchor — watching startup activity");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Anchor", click: () => { win?.show(); win?.focus(); } },
      { type: "separator" },
      { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
    ])
  );
  tray.on("double-click", () => { win?.show(); win?.focus(); });
}

app.whenReady().then(async () => {
  createWindow();
  createTray();
  warmUp();                       // start the PowerShell host before it's needed
  updater.init(win.webContents);

  // Boot Watch: if the user enabled it, watch process starts and, when launched
  // at login, scan persistence and notify about anything suspicious.
  const prof = profile.loadProfile();
  if (prof.bootWatch) {
    bootwatch.watchProcesses(win.webContents);
    if (startedHidden) {
      const findings = await bootwatch.scanPersistence();
      const risky = findings.filter((f) => f.level === "high");
      if (risky.length && Notification.isSupported()) {
        const n = new Notification({
          title: `Anchor found ${risky.length} suspicious startup item${risky.length === 1 ? "" : "s"}`,
          body: risky.slice(0, 2).map((f) => f.name).join(", ") + " — click to review.",
          icon: path.join(__dirname, "..", "build", "icon.ico"),
        });
        n.on("click", () => { win?.show(); win?.focus(); });
        n.show();
      }
    }
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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

handle("boost:restorePoint", (desc) => boost.createRestorePoint(desc ?? "Anchor"));
handle("boost:ensureRestorePoint", (desc, minDays) =>
  boost.ensureRestorePoint(desc ?? "Anchor", minDays ?? 7)
);
handle("boost:lastRestorePoint", () => boost.lastRestorePointAgeDays());
handle("boost:trim", () => boost.trimMemory());
handle("cleanup:scan", () => cleanup.scan());
handle("cleanup:run", (ids) => cleanup.clean(ids ?? []));
handle("cleanup:quick", () => cleanup.quickClean());

handle("sys:buildInfo", () => sys.buildInfo());
handle("sys:checkUpdates", () => sys.checkUpdates());
handle("sys:driveHealth", () => sys.driveHealth());
handle("sys:volumes", () => sys.volumes());
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
handle("sys:openTool", (cmd) => sys.openTool(cmd));

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

handle("profile:load", () => profile.loadProfile());
// `background` is owned by services/background.js; a stale copy from the UI must not undo a pick/reset.
handle("profile:save", (p) => {
  const { background: _ignored, ...rest } = p ?? {};
  return profile.saveProfile(rest);
});
handle("bg:pick", () => background.pickBackground(win));
handle("bg:get", () => background.getBackground());
handle("bg:reset", () => background.resetBackground());
handle("auth:signIn", async (provider) => {
  try {
    const user = await auth.signIn(provider);
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
handle("auth:configured", () => auth.isConfigured());
handle("auth:providers", () => auth.PROVIDERS);
handle("auth:saveSubscription", async (prefs) => {
  const p = profile.loadProfile();
  return auth.saveSubscription({
    accessToken: p.accessToken, userId: p.userId, email: p.email, prefs,
  });
});
handle("auth:deleteSubscription", async () => {
  const p = profile.loadProfile();
  return auth.deleteSubscription({ accessToken: p.accessToken, userId: p.userId });
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
    const user = await auth.verifyEmailCode(email, code);
    return { ok: true, user };
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
  if (on) bootwatch.watchProcesses(win.webContents);
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
  const note = new Notification({
    title: n.title,
    body: typeof n.body === "string" ? n.body : "",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
  });
  note.on("click", () => {
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    win.webContents.send("nav:go", n.target);
  });
  note.show();
});
