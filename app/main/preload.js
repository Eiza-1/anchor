// Security bridge: the UI runs with no Node access and can only call the exact
// functions listed here, each of which maps to audited code in main/services.
const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

// A notification click can reopen a released window and ask it to navigate
// before the UI has subscribed, so the target waits here until it does.
let navListener = null;
let pendingNav = null;
ipcRenderer.on("nav:go", (_e, target) => {
  if (navListener) navListener(target);
  else pendingNav = target;
});

contextBridge.exposeInMainWorld("anchor", {
  // window
  minimize: () => call("win:minimize"),
  maximize: () => call("win:maximize"),
  close: () => call("win:close"),
  appVersion: () => call("app:version"),
  season: () => call("app:season"),
  onSeason: (cb) => {
    const handler = (_e, season) => cb(season);
    ipcRenderer.on("app:season", handler);
    return () => ipcRenderer.removeListener("app:season", handler);
  },

  // safety + boost
  createRestorePoint: (desc) => call("boost:restorePoint", desc),
  ensureRestorePoint: (desc, minDays) => call("boost:ensureRestorePoint", desc, minDays),
  lastRestorePoint: () => call("boost:lastRestorePoint"),
  trimMemory: () => call("boost:trim"),
  boostSystem: () => call("boost:system"),
  cleanupScan: () => call("cleanup:scan"),
  cleanupRun: (ids) => call("cleanup:run", ids),
  cleanupQuick: () => call("cleanup:quick"),

  // windows update
  buildInfo: () => call("sys:buildInfo"),
  checkUpdates: (opts) => call("sys:checkUpdates", opts),
  prefetchUpdates: () => call("sys:prefetchUpdates"),

  // drives / performance
  driveHealth: () => call("sys:driveHealth"),
  volumes: () => call("sys:volumes"),
  isAdmin: () => call("sys:isAdmin"),
  deviceHealth: () => call("sys:deviceHealth"),
  cpuInfo: () => call("sys:cpuInfo"),
  monitorStart: () => call("monitor:start"),
  monitorStop: () => call("monitor:stop"),
  onMonitorSample: (cb) => {
    const handler = (_e, sample) => cb(sample);
    ipcRenderer.on("monitor:sample", handler);
    return () => ipcRenderer.removeListener("monitor:sample", handler);
  },
  perfSample: () => call("sys:perfSample"),
  topProcesses: () => call("sys:topProcesses"),

  // startup / bloatware / privacy
  startupList: () => call("sys:startupList"),
  startupToggle: (name, scope, enable) => call("sys:startupToggle", name, scope, enable),
  bloatwareList: () => call("sys:bloatwareList"),
  bloatwareRemove: (pkgs) => call("sys:bloatwareRemove", pkgs),
  privacyList: () => call("sys:privacyList"),
  privacyApply: (id, on) => call("sys:privacyApply", id, on),

  // tools
  openTool: (id) => call("sys:openTool", id),
  saveAutounattend: (opts) => call("sys:saveAutounattend", opts),

  // news
  feeds: () => call("news:feeds"),
  articles: (sources) => call("news:articles", sources),
  videos: () => call("news:videos"),
  backfillImages: (links) => call("news:backfill", links),
  sourceLogos: () => call("news:logos"),
  gameReleases: () => call("games:releases"),
  freeGames: () => call("games:free"),

  // account
  loadProfile: () => call("profile:load"),
  saveProfile: (p) => call("profile:save", p),
  pickBackground: () => call("bg:pick"),
  getBackground: () => call("bg:get"),
  resetBackground: () => call("bg:reset"),
  signIn: (provider) => call("auth:signIn", provider),
  authConfigured: () => call("auth:configured"),
  authProviders: () => call("auth:providers"),
  saveSubscription: (prefs) => call("auth:saveSubscription", prefs),
  signOut: () => call("auth:signOut"),
  sendEmailCode: (email) => call("auth:sendEmailCode", email),
  verifyEmailCode: (email, code) => call("auth:verifyEmailCode", email, code),

  // performance tweaks
  perfList: () => call("perf:list"),
  perfApply: (id, on) => call("perf:apply", id, on),
  perfApplyRecommended: () => call("perf:applyRecommended"),
  powerPlan: () => call("perf:powerPlan"),
  setPowerPlan: (guid) => call("perf:setPowerPlan", guid),
  addUltimatePlan: () => call("perf:addUltimatePlan"),
  removeDuplicateUltimate: () => call("perf:removeDuplicateUltimate"),
  perfRevertAll: () => call("perf:revertAll"),
  gpuPrefs: () => call("perf:gpuPrefs"),
  setGpuPref: (path, high) => call("perf:setGpuPref", path, high),
  pickExe: () => call("perf:pickExe"),
  gpuInfo: () => call("perf:gpuInfo"),
  pcieState: () => call("perf:pcieState"),
  setPcie: (on) => call("perf:setPcie", on),
  clearShaderCaches: () => call("perf:clearShaderCaches"),

  // disk benchmark + RAM test
  benchRun: (drive, sizeMB) => call("bench:run", drive, sizeMB),
  memoryTestResults: () => call("bench:memoryResults"),
  scheduleMemoryTest: () => call("bench:scheduleMemoryTest"),

  // diagnostics
  diagState: () => call("diag:state"),
  diagProcesses: () => call("diag:processes"),
  diagErrors: (days) => call("diag:errors", days),
  diagRepairs: () => call("diag:repairs"),
  diagRunRepair: (id) => call("diag:runRepair", id),
  diagTrim: (pid) => call("diag:trim", pid),
  diagRestartService: (name) => call("diag:restartService", name),

  // boot watch
  bootScan: () => call("bootwatch:scan"),
  bootDisable: (id) => call("bootwatch:disable", id),
  bootSetEnabled: (on) => call("bootwatch:setEnabled", on),
  bootStatus: () => call("bootwatch:status"),
  onBootProcess: (cb) => {
    const handler = (_e, ev) => cb(ev);
    ipcRenderer.on("bootwatch:process", handler);
    return () => ipcRenderer.removeListener("bootwatch:process", handler);
  },

  // in-app updates
  updateCheck: () => call("update:check"),
  updateDownload: () => call("update:download"),
  updateInstall: () => call("update:install"),
  updateNotes: (limit) => call("update:notes", limit),
  onUpdateEvent: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("update:event", handler);
    return () => ipcRenderer.removeListener("update:event", handler);
  },
  openExternal: (url) => call("app:openExternal", url),
  notify: (n) => call("app:notify", n),
  setBusy: (busy) => ipcRenderer.send("app:busy", !!busy),
  onNavigate: (cb) => {
    navListener = cb;
    if (pendingNav) { cb(pendingNav); pendingNav = null; }
    return () => { if (navListener === cb) navListener = null; };
  },
});
