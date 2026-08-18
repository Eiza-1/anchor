// Security bridge: the UI runs with no Node access and can only call the exact
// functions listed here, each of which maps to audited code in main/services.
const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("anchor", {
  // window
  minimize: () => call("win:minimize"),
  maximize: () => call("win:maximize"),
  close: () => call("win:close"),
  appVersion: () => call("app:version"),

  // safety + boost
  createRestorePoint: (desc) => call("boost:restorePoint", desc),
  runBoost: (opts) => call("boost:run", opts),

  // windows update
  buildInfo: () => call("sys:buildInfo"),
  checkUpdates: () => call("sys:checkUpdates"),

  // drives / performance
  driveHealth: () => call("sys:driveHealth"),
  volumes: () => call("sys:volumes"),
  deviceHealth: () => call("sys:deviceHealth"),
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
  openTool: (cmd) => call("sys:openTool", cmd),
  saveAutounattend: (opts) => call("sys:saveAutounattend", opts),

  // news
  feeds: () => call("news:feeds"),
  articles: (sources) => call("news:articles", sources),
  videos: () => call("news:videos"),
  windowsNews: () => call("news:windows"),
  backfillImages: (links) => call("news:backfill", links),

  // account
  loadProfile: () => call("profile:load"),
  saveProfile: (p) => call("profile:save", p),
  signIn: (provider) => call("auth:signIn", provider),
  authConfigured: () => call("auth:configured"),
  authProviders: () => call("auth:providers"),
  sendEmailCode: (email) => call("auth:sendEmailCode", email),
  verifyEmailCode: (email, code) => call("auth:verifyEmailCode", email, code),

  // performance tweaks
  perfList: () => call("perf:list"),
  perfApply: (id, on) => call("perf:apply", id, on),
  perfApplyRecommended: () => call("perf:applyRecommended"),
  powerPlan: () => call("perf:powerPlan"),
  setPowerPlan: (guid) => call("perf:setPowerPlan", guid),
  addUltimatePlan: () => call("perf:addUltimatePlan"),
  gpuPrefs: () => call("perf:gpuPrefs"),
  setGpuPref: (path, high) => call("perf:setGpuPref", path, high),
  pickExe: () => call("perf:pickExe"),
  gpuInfo: () => call("perf:gpuInfo"),
  pcieState: () => call("perf:pcieState"),
  setPcie: (on) => call("perf:setPcie", on),
  clearShaderCaches: () => call("perf:clearShaderCaches"),

  // app updates + links
  checkAppUpdate: () => call("app:checkUpdate"),

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
});
