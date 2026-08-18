export interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: number;
  summary: string;
  imageUrl: string | null;
}

export interface AnchorApi {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  appVersion(): Promise<string>;

  createRestorePoint(desc: string): Promise<{ ok: boolean; message: string }>;
  runBoost(opts: { includeTemp: boolean; includeRecycleBin: boolean }): Promise<{
    trimmed: number; freedBytes: number; skipped: string[]; tempBytes: number; tempFiles: number;
  }>;

  buildInfo(): Promise<{ ProductName: string; DisplayVersion: string; CurrentBuild: string; UBR: number } | null>;
  checkUpdates(): Promise<{ pending?: number; titles?: string[]; last?: string | null; error?: string }>;

  driveHealth(): Promise<Array<{
    name: string; media: string; health: string; size: number;
    wear?: number; temp?: number; predictFailure?: boolean;
  }>>;
  volumes(): Promise<Array<{ DeviceID: string; FreeSpace: number; Size: number }>>;
  deviceHealth(): Promise<Array<{
    name: string; deviceClass: string; code: number;
    meaning: string; advice: string; severity: "bad" | "info";
  }>>;
  perfSample(): Promise<{ cpu: number; disk: number; memTotal: number; memUsed: number } | null>;
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
  windowsNews(): Promise<NewsItem[]>;
  backfillImages(links: string[]): Promise<Record<string, string>>;

  loadProfile(): Promise<Profile>;
  saveProfile(p: Partial<Profile>): Promise<Profile>;
  signIn(provider: string): Promise<{ ok: boolean; user?: { name: string; email: string }; error?: string }>;
  authConfigured(): Promise<boolean>;
  authProviders(): Promise<string[]>;
  sendEmailCode(email: string): Promise<{ ok: boolean; error?: string }>;
  verifyEmailCode(email: string, code: string): Promise<{ ok: boolean; user?: { name: string; email: string }; error?: string }>;

  perfList(): Promise<Array<{
    id: string; name: string; desc: string; category: string;
    needsRestart: boolean; recommended: boolean; applied: boolean;
  }>>;
  perfApply(id: string, on: boolean): Promise<{ ok: boolean; error: string }>;
  perfApplyRecommended(): Promise<Array<{ id: string; ok: boolean }>>;
  powerPlan(): Promise<{ active: string; plans: { guid: string; name: string }[] }>;
  setPowerPlan(guid: string): Promise<{ ok: boolean; error: string }>;
  addUltimatePlan(): Promise<{ ok: boolean; error: string }>;
  gpuPrefs(): Promise<Array<{ path: string; value: string }>>;
  setGpuPref(path: string, high: boolean): Promise<{ ok: boolean; error: string }>;
  pickExe(): Promise<string | null>;
  gpuInfo(): Promise<Array<{
    name: string; driver: string; driverDate: string | null;
    vram: number; status: string; ageDays: number | null;
  }>>;
  pcieState(): Promise<{ saving: boolean }>;
  setPcie(on: boolean): Promise<{ ok: boolean; error: string }>;
  clearShaderCaches(): Promise<{ bytes: number; cleared: string[] }>;

  checkAppUpdate(): Promise<{
    available: boolean; latestVersion?: string; currentVersion?: string;
    releaseUrl?: string; installerUrl?: string | null; notes?: string;
  } | null>;
  openExternal(url: string): Promise<void>;
}

export interface Profile {
  name: string;
  email: string;
  provider: string;
  mailWindowsUpdates: boolean;
  mailSystemHealth: boolean;
  mailTechNews: boolean;
  mailAnchorUpdates: boolean;
}

declare global {
  interface Window {
    anchor: AnchorApi;
  }
}
