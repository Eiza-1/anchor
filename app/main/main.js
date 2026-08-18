const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const boost = require("./services/boost");
const sys = require("./services/system");
const news = require("./services/news");
const profile = require("./services/profile");
const auth = require("./services/auth");
const appUpdate = require("./services/appUpdate");
const perf = require("./services/perftweaks");
const updater = require("./services/updater");
const { warmUp, shutdown } = require("./services/ps");

let win;

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
    titleBarOverlay: { color: "#09090b", symbolColor: "#a1a1aa", height: 40 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => win.show());
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

app.whenReady().then(() => {
  createWindow();
  warmUp();                       // start the PowerShell host before it's needed
  updater.init(win.webContents);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", shutdown);

// ---------------- IPC ----------------
const handle = (channel, fn) => ipcMain.handle(channel, (_e, ...args) => fn(...args));

handle("win:minimize", () => win?.minimize());
handle("win:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
handle("win:close", () => win?.close());
handle("app:version", () => app.getVersion());

handle("boost:restorePoint", (desc) => boost.createRestorePoint(desc ?? "Anchor"));
handle("boost:run", (opts) => boost.runFullBoost(opts ?? {}));

handle("sys:buildInfo", () => sys.buildInfo());
handle("sys:checkUpdates", () => sys.checkUpdates());
handle("sys:driveHealth", () => sys.driveHealth());
handle("sys:volumes", () => sys.volumes());
handle("sys:deviceHealth", () => sys.deviceHealth());
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
handle("news:windows", () => news.fetchWindowsUpdateNews());
handle("news:backfill", (links) => news.backfillImages(links ?? []));

handle("profile:load", () => profile.loadProfile());
handle("profile:save", (p) => profile.saveProfile(p ?? {}));
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

handle("app:checkUpdate", () => appUpdate.checkForUpdate());
handle("update:check", () => updater.check());
handle("update:download", () => updater.download());
handle("update:install", () => updater.install());
handle("update:notes", (limit) => updater.releaseNotes(limit));
handle("app:openExternal", (url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) shell.openExternal(url);
});
