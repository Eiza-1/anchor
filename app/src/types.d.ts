import type { Season } from "./components/brand-marks";

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: number;
  summary: string;
  imageUrl: string | null;
  /** Videos only: a YouTube Short (vertical clip) */
  isShort?: boolean;
}

export type Platform = "pc" | "playstation" | "xbox" | "switch";
export interface GameRelease {
  id: number; name: string; slug: string;
  released: string; // YYYY-MM-DD
  image: string | null; platforms: Platform[]; genres: string[];
  added: number; // people tracking it on RAWG
  url: string;
}
export interface FreeGame {
  id: number; title: string; image: string;
  store: "steam" | "epic" | "gog";
  endDate: string | null; worth: string | null; url: string;
}
export type GamesResult<T> = { ok: true; items: T[] } | { ok: false; reason: "no-key" | "network" };

export interface AnchorApi {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  appVersion(): Promise<string>;
  /** Today's seasonal logo, or null (also null when "Seasonal logos" is off). */
  season(): Promise<Season | null>;
  onSeason(cb: (season: Season | null) => void): () => void;

  createRestorePoint(desc: string): Promise<{ ok: boolean; message: string }>;
  ensureRestorePoint(desc: string, minDays: number): Promise<{ ok: boolean; skipped?: boolean; message: string }>;
  lastRestorePoint(): Promise<{ days: number; description: string | null }>;
  trimMemory(): Promise<{ trimmed: number; freedBytes: number; skipped: string[] }>;

  cleanupScan(): Promise<Array<{
    id: string; name: string; detail: string;
    default: boolean; oneWay: boolean; bytes: number;
  }>>;
  cleanupRun(ids: string[]): Promise<{ freed: number; cleaned: string[]; items: Array<{ name: string; freed: number }> }>;
  cleanupQuick(): Promise<{ freed: number; cleaned: string[]; items: Array<{ name: string; freed: number }> }>;

  buildInfo(): Promise<{ ProductName: string; DisplayVersion: string; CurrentBuild: string; UBR: number } | null>;
  checkUpdates(): Promise<{ pending?: number; titles?: string[]; last?: string | null; error?: string }>;

  driveHealth(): Promise<Array<{
    name: string; media: string; health: string; size: number;
    wear?: number; temp?: number; predictFailure?: boolean;
  }>>;
  isAdmin(): Promise<boolean>;
  volumes(): Promise<Array<{ DeviceID: string; FreeSpace: number; Size: number }>>;
  deviceHealth(): Promise<Array<{
    name: string; deviceClass: string; code: number;
    meaning: string; advice: string; severity: "bad" | "info";
  }>>;
  perfSample(): Promise<{ cpu: number; disk: number; memTotal: number; memUsed: number } | null>;
  cpuInfo(): Promise<{ name: string; cores: number; threads: number; maxClockMHz: number } | null>;
  monitorStart(): Promise<void>;
  monitorStop(): Promise<void>;
  onMonitorSample(cb: (s: {
    t: number; cpu: number | null; gpu: number | null; disk: number | null;
    memUsed: number | null; memTotal: number | null; vram: number | null;
  }) => void): () => void;
  topProcesses(): Promise<Array<{ name: string; count: number; bytes: number }>>;

  startupList(): Promise<Array<{ name: string; command: string; scope: string; enabled: boolean }>>;
  startupToggle(name: string, scope: string, enable: boolean): Promise<{ ok: boolean; error: string }>;
  bloatwareList(): Promise<Array<{ name: string; packageFullName: string; safe: boolean }>>;
  bloatwareRemove(pkgs: Array<{ name: string; packageFullName: string }>): Promise<Array<{ name: string; ok: boolean; error: string }>>;
  privacyList(): Promise<Array<{ id: string; name: string; desc: string; applied: boolean }>>;
  privacyApply(id: string, on: boolean): Promise<{ ok: boolean; error: string }>;

  openTool(cmd: string): Promise<void>;
  saveAutounattend(opts: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;

  feeds(): Promise<{ articles: string[]; videos: string[] }>;
  articles(sources?: string[]): Promise<NewsItem[]>;
  videos(): Promise<NewsItem[]>;
  backfillImages(links: string[]): Promise<Record<string, string>>;
  gameReleases(): Promise<GamesResult<GameRelease>>;
  freeGames(): Promise<GamesResult<FreeGame>>;

  loadProfile(): Promise<Profile>;
  saveProfile(p: Partial<Profile>): Promise<Profile>;
  pickBackground(): Promise<{ ok: boolean; message?: string }>;
  getBackground(): Promise<{ type: string; bytes: Uint8Array<ArrayBuffer> } | null>;
  resetBackground(): Promise<void>;
  signIn(provider: string): Promise<{
    ok: boolean;
    user?: { name: string; email: string; userId: string; accessToken: string };
    error?: string;
  }>;
  saveSubscription(prefs: Partial<Profile>): Promise<{ ok: boolean; error?: string }>;
  deleteSubscription(): Promise<{ ok: boolean; error?: string }>;
  authConfigured(): Promise<boolean>;
  authProviders(): Promise<string[]>;
  sendEmailCode(email: string): Promise<{ ok: boolean; error?: string }>;
  verifyEmailCode(email: string, code: string): Promise<{
    ok: boolean;
    user?: { name: string; email: string; userId: string; accessToken: string };
    error?: string;
  }>;

  perfList(): Promise<PerfTweak[]>;
  perfApply(id: string, on: boolean): Promise<{ ok: boolean; error: string }>;
  perfApplyRecommended(): Promise<Array<{ id: string; ok: boolean }>>;
  perfRevertAll(): Promise<Array<{ name: string; ok: boolean; error: string }>>;
  powerPlan(): Promise<{ active: string; plans: { guid: string; name: string }[]; ultimateCopies: number }>;
  setPowerPlan(guid: string): Promise<{ ok: boolean; error: string }>;
  addUltimatePlan(): Promise<{ ok: boolean; error: string; existed?: boolean }>;
  removeDuplicateUltimate(): Promise<{ ok: boolean; error: string; removed: number }>;
  gpuPrefs(): Promise<Array<{ path: string; value: string }>>;
  setGpuPref(path: string, high: boolean): Promise<{ ok: boolean; error: string }>;
  pickExe(): Promise<string | null>;
  gpuInfo(): Promise<Array<{
    name: string; driver: string; driverDate: string | null;
    status: string; ageDays: number | null; errorCode?: number;
    /** bytes from the graphics driver; null when it couldn't be read */
    dedicated: number | null; shared: number | null; hwSchSupported: boolean | null;
  }>>;
  pcieState(): Promise<{ saving: boolean }>;
  setPcie(on: boolean): Promise<{ ok: boolean; error: string }>;
  clearShaderCaches(): Promise<{ bytes: number; cleared: string[] }>;

  benchRun(drive: string, sizeMB: number): Promise<{
    drive?: string; sizeMB?: number; unbuffered?: boolean;
    seqReadMB?: number; seqWriteMB?: number;
    rndReadMB?: number; rndWriteMB?: number;
    rndReadIOPS?: number; rndWriteIOPS?: number;
    error?: string;
  }>;
  memoryTestResults(): Promise<{ found: boolean; time?: string; passed?: boolean; message?: string }>;
  scheduleMemoryTest(): Promise<{ ok: boolean; error: string }>;

  diagState(): Promise<import("@/lib/diagnose").SystemState>;
  diagProcesses(): Promise<import("@/lib/diagnose").ProcSample[]>;
  diagErrors(days?: number): Promise<{
    total: number;
    groups: { source: string; count: number; latest: string; sample: string }[];
  }>;
  diagRepairs(): Promise<{ id: string; name: string; detail: string; minutes: string }[]>;
  diagRunRepair(id: string): Promise<{ ok: boolean; output: string; error: string }>;
  diagTrim(pid: number): Promise<{ ok: boolean; error: string }>;
  diagRestartService(name: string): Promise<{ ok: boolean; error: string }>;

  bootScan(): Promise<BootFinding[]>;
  bootDisable(id: string): Promise<{ ok: boolean; error: string }>;
  bootSetEnabled(on: boolean): Promise<{ ok: boolean }>;
  bootStatus(): Promise<{ enabled: boolean; openAtLogin: boolean }>;
  onBootProcess(cb: (ev: BootProcessEvent) => void): () => void;

  updateCheck(): Promise<void>;
  updateDownload(): Promise<void>;
  updateInstall(): Promise<void>;
  updateNotes(limit?: number): Promise<Array<{
    version: string; name: string; date: string; notes: string; url: string; isCurrent: boolean;
  }>>;
  onUpdateEvent(cb: (payload: {
    status: import("@/lib/store").UpdateStatus; version?: string; notes?: string;
    percent?: number; message?: string;
  }) => void): () => void;
  openExternal(url: string): Promise<void>;
  notify(n: { title: string; body: string; target: import("@/lib/nav").NavTarget }): Promise<void>;
  setBusy(busy: boolean): void;
  onNavigate(cb: (t: import("@/lib/nav").NavTarget) => void): () => void;
}

export interface PerfTweak {
  id: string; name: string; desc: string; category: string;
  /** what it really changes: frame rate, frame pacing, input latency, or only the desktop */
  effect: "fps" | "smoothness" | "latency" | "desktop";
  needsRestart: boolean; recommended: boolean; applied: boolean;
  /** false when this PC's hardware can't use it (e.g. GPU scheduling) */
  supported: boolean;
  /** not listed: unsupported here, or retired (still undone by Revert all) */
  hidden: boolean;
  /** set, but Windows only picks it up after a restart */
  pendingRestart: boolean;
  /** Anchor saved the original values, so switching off restores exactly those */
  hasBackup: boolean;
}

export interface BootFinding {
  id: string;
  source: string;
  name: string;
  location: string;
  command: string;
  path: string;
  runAs: string | null;
  author: string | null;
  trigger: string | null;
  enabled: boolean;
  lastRun: string | null;
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
}

export interface BootProcessEvent {
  time: number;
  name: string;
  pid: number;
  parent: string;
  parentPid: number;
  command: string;
  path: string;
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
}

export interface Profile {
  name: string;
  displayName: string;
  email: string;
  provider: string;
  mailWindowsUpdates: boolean;
  mailSystemHealth: boolean;
  mailTechNews: boolean;
  mailAnchorUpdates: boolean;
  restorePolicy: "weekly" | "monthly" | "always";
  bootWatch: boolean;
  theme: string;
  seasonalLogos: boolean;
  background: string;
  userId: string;
  accessToken: string;
}

declare global {
  interface Window {
    anchor: AnchorApi;
  }
}
