// App-level state that lives OUTSIDE React, so long-running jobs (health check,
// boost) keep running and keep their results when the user switches pages.
// Pages subscribe with useAppState(); the jobs themselves are plain functions here.
import { useSyncExternalStore } from "react";
import { formatBytes } from "@/lib/utils";
import { runTask } from "@/lib/tasks";
import type { NavTarget } from "@/lib/nav";
import { THEME_KEY } from "@/lib/theme-boot";

export type HealthStatus = "ok" | "warn" | "bad" | "info" | "tip";
export type HealthIcon =
  | "windows" | "update" | "ssd" | "hdd" | "disk" | "cpu" | "memory" | "gauge" | "tip" | "device";

export interface HealthLine {
  id: string;
  order: number;
  status: HealthStatus;
  icon: HealthIcon;
  title: string;
  detail?: string;
}

export interface HealthState {
  running: boolean;
  done: number;
  total: number;
  lines: HealthLine[];
  finishedAt: number | null;
}

export interface BoostState {
  running: boolean;
  message: string;
  skipped: string[];
  finishedAt: number | null;
  /** What each location freed, biggest first (Boost only). */
  items?: Array<{ name: string; freed: number }>;
  /** Disk space the cleanup freed (Boost only). */
  cleaned?: number;
  /** Memory trim and background-CPU pass (Boost only); null if it failed. */
  system?: import("@/types").BoostSystemResult | null;
}

interface AppState {
  health: HealthState;
  boost: BoostState;  // one-click Boost (quick clean)
  trim: BoostState;   // optional memory trim on the Cleanup page
}

const idle: BoostState = { running: false, message: "", skipped: [], finishedAt: null };

// The last finished health check is kept, so Home isn't blank on launch.
function savedHealth(): HealthState {
  try {
    const h = JSON.parse(localStorage.getItem("anchor:health") ?? "null");
    if (h?.lines) return { ...h, running: false };
  } catch { /* ignore */ }
  return { running: false, done: 0, total: 6, lines: [], finishedAt: null };
}

const initial: AppState = { health: savedHealth(), boost: idle, trim: idle };

let state: AppState = initial;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const getState = () => state;
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

function setHealth(update: (h: HealthState) => HealthState) {
  state = { ...state, health: update(state.health) };
  emit();
}
function setJob(job: "boost" | "trim", next: BoostState) {
  state = { ...state, [job]: next };
  emit();
}

/* --------------------------------- Cache ---------------------------------- *
 * Pages unmount when you navigate. Without this, every visit refetched
 * everything — the main reason the app felt slow. Results are kept here with a
 * TTL, so returning to a page is instant and only stale data is re-requested.
 *
 * Results are also saved to localStorage with the time they were fetched, so
 * a fresh launch paints every page from last time's data at once, and only
 * data older than its TTL is re-requested (the release calendar keeps its
 * one-request-per-24 h budget across launches). Infinity-TTL data is fetched
 * once per session: a saved copy paints first but is always re-read.
 *
 * The saved copy is tied to the app version: pages paint it before any fetch,
 * so a shape an older version saved (tweaks without `effect`, GPU info with
 * `vram`) would crash or blank the page on the first launch after an update. */
type Entry = { value: unknown; at: number; inflight?: Promise<unknown>; fromDisk?: boolean };
const cache = new Map<string, Entry>();
const CACHE_ROOT = "anchor:cache:";
const STORE_PREFIX = `${CACHE_ROOT}${__APP_VERSION__}:`; // anything else is from another version

function save(key: string, value: unknown, at: number) {
  try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify({ value, at })); } catch { /* full or unavailable */ }
}
try {
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(CACHE_ROOT)) continue;
    if (!k.startsWith(STORE_PREFIX)) { stale.push(k); continue; } // older format
    try {
      const saved = JSON.parse(localStorage.getItem(k) ?? "null");
      if (saved && "value" in saved) {
        const at = typeof saved.at === "number" && saved.at <= Date.now() ? saved.at : 0;
        cache.set(k.slice(STORE_PREFIX.length), { value: saved.value, at, fromDisk: true });
      }
    } catch { /* corrupt entry — skip it */ }
  }
  stale.forEach((k) => localStorage.removeItem(k));
} catch { /* unavailable — start empty */ }

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) {
    if (hit.inflight) return hit.inflight as Promise<T>;
    const age = hit.fromDisk && ttlMs === Infinity ? Infinity : Date.now() - hit.at;
    if (hit.value !== undefined && age < ttlMs) return hit.value as T;
  }
  const inflight = fn()
    .then((value) => {
      const at = Date.now();
      cache.set(key, { value, at });
      save(key, value, at);
      return value;
    })
    .catch((e) => {
      if (hit?.value !== undefined) cache.set(key, { value: hit.value, at: hit.at, fromDisk: hit.fromDisk });
      else cache.delete(key);
      throw e;
    });
  cache.set(key, { value: hit?.value, at: hit?.at ?? 0, fromDisk: hit?.fromDisk, inflight });
  return inflight as Promise<T>;
}

/** Read whatever is cached right now (for instant first paint), or undefined. */
export function peek<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined;
}

/** Write a page's current view back (e.g. after a toggle) without resetting its age. */
export function remember<T>(key: string, value: T) {
  const hit = cache.get(key);
  const at = hit?.at ?? 0;
  cache.set(key, { ...hit, value, at });
  save(key, value, at);
}

/** Marks entries stale: the next read refetches, but peek() keeps showing the
 *  old value meanwhile, so a refresh never blanks the page. */
export function invalidate(...keys: string[]) {
  keys.forEach((k) => {
    const hit = cache.get(k);
    if (hit && !hit.inflight) cache.set(k, { value: hit.value, at: -Infinity }); // stale even for Infinity TTLs
  });
}

/* ------------------------------ Live monitor ------------------------------ *
 * Samples stream in from a PowerShell monitor in the main process. Kept here so
 * history survives page switches — the pairing verdict needs a minute of load,
 * which the user will usually spend inside a game, not staring at Anchor.       */
import type { Sample } from "@/lib/bottleneck";

const MAX_SAMPLES = 240; // ~4 minutes at ~1s

let samples: Sample[] = [];
let monitorOn = false;
let stopFn: (() => void) | null = null;
const sampleListeners = new Set<() => void>();
const subscribeSamples = (l: () => void) => {
  sampleListeners.add(l);
  return () => void sampleListeners.delete(l);
};
export const getSamples = () => samples;
export function useSamples(): Sample[] {
  return useSyncExternalStore(subscribeSamples, getSamples, getSamples);
}

export function startMonitor() {
  if (monitorOn) return;
  monitorOn = true;
  stopFn = window.anchor.onMonitorSample((s: Sample) => {
    samples = [...samples, s].slice(-MAX_SAMPLES);
    sampleListeners.forEach((l) => l());
  });
  window.anchor.monitorStart();
}

export function stopMonitor() {
  if (!monitorOn) return;
  monitorOn = false;
  stopFn?.();
  stopFn = null;
  window.anchor.monitorStop();
}

export const isMonitoring = () => monitorOn;
export function clearSamples() {
  samples = [];
  sampleListeners.forEach((l) => l());
}

/* --------------------------- Leak history sampling ------------------------- *
 * Leak detection needs observations over time, so sampling runs in the store —
 * it keeps going while the user is on other pages, and the history is waiting
 * when they come back.                                                          */
import type { ProcSample } from "@/lib/diagnose";

let procHistory: { t: number; procs: ProcSample[] }[] = [];
let leakTimer: ReturnType<typeof setInterval> | null = null;
const leakListeners = new Set<() => void>();
const subscribeLeaks = (l: () => void) => {
  leakListeners.add(l);
  return () => void leakListeners.delete(l);
};
export const getProcHistory = () => procHistory;
export function useProcHistory() {
  return useSyncExternalStore(subscribeLeaks, getProcHistory, getProcHistory);
}

async function sampleProcesses() {
  try {
    const procs = await window.anchor.diagProcesses();
    procHistory = [...procHistory, { t: Date.now(), procs }].slice(-120); // ~2h at 60s
    leakListeners.forEach((l) => l());
  } catch { /* ignore a failed sample */ }
}

export function startLeakWatch(intervalMs = 60_000) {
  if (leakTimer) return;
  sampleProcesses();
  leakTimer = setInterval(sampleProcesses, intervalMs);
}
export function stopLeakWatch() {
  if (leakTimer) clearInterval(leakTimer);
  leakTimer = null;
}
export const isLeakWatching = () => leakTimer !== null;
export function clearLeakHistory() {
  procHistory = [];
  leakListeners.forEach((l) => l());
}

/* --------------------------- Restore point policy -------------------------- *
 * Restore points are only worth making before changes that are genuinely hard
 * to undo (removing apps, registry tweaks). They take disk space, and Windows
 * deletes the oldest ones to make room — so spamming them destroys the very
 * history you'd want to roll back to.                                          */
export const RESTORE_INTERVALS: Record<string, number> = {
  always: 0,
  weekly: 7,
  monthly: 30,
};

/** Call before any change that modifies the system in a non-trivial way. */
export async function ensureRestorePoint(description: string) {
  const profile = await window.anchor.loadProfile();
  const days = RESTORE_INTERVALS[profile.restorePolicy ?? "weekly"] ?? 7;
  return window.anchor.ensureRestorePoint(description, days);
}

/** Manual restore point, tracked so it survives page switches. Returns undefined
 *  when one is already running or a change is in progress. `where` is the page
 *  it was started from, which its pop-up and sidebar dot point to. */
export function runRestorePoint(description: string, where: NavTarget = { section: "account" }) {
  return runTask(
    "restore:create",
    {
      label: "Restore point",
      where,
      group: "restore",
      isError: (r: { ok: boolean; message: string }) => (r.ok ? null : r.message),
      summarize: (r) => r.message,
    },
    async () => {
      const r = await window.anchor.createRestorePoint(description);
      invalidate("restore:last");
      return r;
    },
  );
}

/* --------------------------------- Themes --------------------------------- */
export const THEMES = [
  { id: "dark", name: "Dark", hint: "Default — charcoal with sky blue", swatch: ["#09090b", "#27272a", "#38bdf8"] },
  { id: "light", name: "Light", hint: "Soft grey — kinder than pure white", swatch: ["#eeeef2", "#f7f7fa", "#2b2b33"] },
  { id: "midnight", name: "Midnight", hint: "Deep navy, softer than black", swatch: ["#0b1220", "#1e293b", "#60a5fa"] },
  { id: "ember", name: "Ember", hint: "Warm greys, low blue light", swatch: ["#12100e", "#2a2422", "#f97316"] },
  { id: "tide", name: "Tide", hint: "Cool blue-green, easy on the eyes", swatch: ["#0d1a1f", "#22383f", "#2dd4bf"] },
  { id: "crimson", name: "Crimson", hint: "Near-black with red accents", swatch: ["#0f0a0a", "#2d1f1f", "#dc4444"] },
  { id: "vault", name: "Vault", hint: "Deep red into violet", swatch: ["#0d0912", "#2a1f33", "#e8437a"] },
  { id: "amethyst", name: "Amethyst", hint: "Deep purple with indigo edges", swatch: ["#0b0713", "#291f3a", "#a878ff"] },
] as const;

export function applyTheme(id: string) {
  const known = THEMES.some((t) => t.id === id) ? id : "dark";
  document.documentElement.dataset.theme = known;
  try { localStorage.setItem(THEME_KEY, known); } catch { /* ignore */ } // for theme-boot.ts on next launch
  // keep the native title-bar buttons readable on light themes
  const light = known === "light";
  document.documentElement.classList.toggle("dark", !light);
}

/* ------------------------------ App updates ------------------------------- */
export type UpdateStatus =
  | "idle" | "checking" | "current" | "available" | "downloading" | "downloaded" | "error";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  notes?: string;
  percent?: number;
  message?: string;
}

let updateState: UpdateState = { status: "idle" };
const updateListeners = new Set<() => void>();
const subscribeUpdate = (l: () => void) => {
  updateListeners.add(l);
  return () => void updateListeners.delete(l);
};
export const getUpdateState = () => updateState;
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
}

/** Wired once from App — receives events pushed by electron-updater. */
export function initUpdates() {
  window.anchor.onUpdateEvent((p) => {
    updateState = { ...updateState, ...p };
    updateListeners.forEach((l) => l());
  });
  window.anchor.updateCheck();
}

/* ------------------------------ Health check ------------------------------ */
/** Runs every check in parallel and streams each result in as it lands, so the
 *  slowest one (Windows Update, which can take a while) never blocks the rest. */
export async function runHealthCheck() {
  if (state.health.running) return;
  await runTask(
    "home:health",
    {
      label: "Health Check",
      where: { section: "home" },
      summarize: (lines: HealthLine[]) => {
        const n = lines.filter((l) => l.status === "bad" || l.status === "warn").length;
        return n === 0 ? "No issues found" : `${n} issue${n === 1 ? "" : "s"} found`;
      },
    },
    healthJob,
  );
}

async function healthJob(): Promise<HealthLine[]> {
  setHealth(() => ({ running: true, done: 0, total: 6, lines: [], finishedAt: null }));

  const add = (line: HealthLine) =>
    setHealth((h) => ({ ...h, lines: [...h.lines, line] }));
  const step = () => setHealth((h) => ({ ...h, done: h.done + 1 }));

  const jobs = [
    (async () => {
      const b = await window.anchor.buildInfo();
      if (b)
        add({
          id: "build", order: 0, status: "info", icon: "windows",
          title: `${b.ProductName} ${b.DisplayVersion}`,
          detail: `Build ${b.CurrentBuild}.${b.UBR}`,
        });
    })(),

    (async () => {
      const u = await window.anchor.checkUpdates();
      if (u.error)
        add({
          id: "updates", order: 1, status: "warn", icon: "update",
          title: "Couldn't query Windows Update",
          detail: `${u.error} Open Settings > Windows Update to check manually.`,
        });
      else if (u.pending === 0)
        add({
          id: "updates", order: 1, status: "ok", icon: "update",
          title: "Windows is up to date",
          detail: "No cumulative, security, or feature updates are pending.",
        });
      else
        add({
          id: "updates", order: 1, status: "warn", icon: "update",
          title: `${u.pending} update${u.pending === 1 ? "" : "s"} pending`,
          detail: "Installing cumulative and security updates keeps your system stable and secure.",
        });
    })(),

    (async () => {
      for (const [i, d] of (await window.anchor.driveHealth()).entries()) {
        const bad = d.predictFailure || d.health === "Unhealthy";
        const warn = d.health === "Warning";
        add({
          id: `drive-${i}`, order: 2 + i * 0.01,
          status: bad ? "bad" : warn ? "warn" : "ok",
          icon: d.media === "SSD" ? "ssd" : "hdd",
          title: `${d.name} — ${d.media}, ${formatBytes(d.size)}`,
          detail: bad
            ? d.predictFailure
              ? "S.M.A.R.T. predicts failure. Back up now and replace this drive."
              : "Failure indicators detected. Back up now and replace this drive."
            : warn
            ? "Early signs of trouble — back up important files soon."
            : "No failure signs detected.",
        });
      }
    })(),

    (async () => {
      for (const [i, v] of (await window.anchor.volumes()).entries()) {
        const pct = (v.FreeSpace / v.Size) * 100;
        add({
          id: `vol-${i}`, order: 3 + i * 0.01,
          status: pct < 10 ? "warn" : "info",
          icon: "disk",
          title: `${v.DeviceID} ${formatBytes(v.FreeSpace)} free`,
          detail: `of ${formatBytes(v.Size)} (${Math.round(pct)}% free)${pct < 10 ? " — running low" : ""}`,
        });
      }
    })(),

    (async () => {
      const devices = await window.anchor.deviceHealth();
      const faults = devices.filter((d) => d.severity === "bad");
      if (faults.length === 0) {
        add({
          id: "devices", order: 2.5, status: "ok", icon: "device",
          title: "All hardware is working",
          detail: "No devices are reporting problems in Device Manager.",
        });
      } else {
        faults.forEach((d, i) =>
          add({
            id: `device-${i}`, order: 2.5 + i * 0.01, status: "bad", icon: "device",
            title: `${d.name} — Code ${d.code}`,
            detail: `${d.meaning}. ${d.advice}`,
          })
        );
      }
    })(),

    (async () => {
      const p = await window.anchor.perfSample();
      if (!p) return;
      const memPct = Math.round((p.memUsed / p.memTotal) * 100);
      add({
        id: "cpu", order: 4, status: p.cpu > 85 ? "warn" : "info", icon: "cpu",
        title: `CPU ${p.cpu}%`,
        detail: p.cpu > 85 ? "Under heavy load right now." : "Plenty of headroom.",
      });
      add({
        id: "mem", order: 4.1, status: memPct > 85 ? "warn" : "info", icon: "memory",
        title: `Memory ${memPct}%`,
        detail: `${formatBytes(p.memUsed)} of ${formatBytes(p.memTotal)} in use`,
      });
      add({
        id: "diskact", order: 4.2, status: p.disk > 80 ? "warn" : "info", icon: "gauge",
        title: `Disk activity ${p.disk}%`,
        detail: p.disk > 80 ? "The drive is a bottleneck right now." : "Normal.",
      });

      const tips: string[] = [];
      if (p.cpu > 85) tips.push("Check the Performance page for the heaviest app — closing or updating it usually helps most.");
      if (memPct > 85) tips.push("Run Boost to trim background apps, or disable startup apps you don't need.");
      if (p.memTotal < 8 * 1024 ** 3) tips.push("This PC has under 8 GB of RAM — a RAM upgrade is the most effective fix for sluggishness.");
      if (p.disk > 80) tips.push("If this is an HDD, upgrading to an SSD is transformative. Also check Storage Sense and search indexing.");
      tips.forEach((t, i) =>
        add({ id: `tip-${i}`, order: 5 + i * 0.01, status: "tip", icon: "tip", title: t })
      );
    })(),
  ].map((p) => p.then(step, step));

  await Promise.allSettled(jobs);
  setHealth((h) => ({ ...h, running: false, finishedAt: Date.now() }));
  try { localStorage.setItem("anchor:health", JSON.stringify(state.health)); } catch { /* ignore */ }
  return state.health.lines;
}

/* --------------------------------- Boost --------------------------------- */
/** One-click Boost: clears the Cleanup page's default locations (only caches
 *  and leftovers — nothing that needs rolling back — so no restore point),
 *  then trims memory if it's short and lowers background CPU hogs' priority. */
export async function runBoost() {
  if (state.boost.running) return;
  await runTask(
    "home:boost",
    {
      label: "Boost",
      where: { section: "home" },
      group: "cleanup",
      summarize: (r: { freed: number }) => `Freed ${formatBytes(r.freed)}`,
    },
    async () => {
      setJob("boost", { ...idle, running: true, message: "Cleaning up…" });
      try {
        const r = await window.anchor.cleanupQuick();
        invalidate("cleanup:scan");
        setJob("boost", { ...idle, running: true, message: "Checking memory and background apps…" });
        // the cleanup's result stands even if this part fails
        const system = await window.anchor.boostSystem().catch(() => null);
        setJob("boost", {
          ...idle,
          finishedAt: Date.now(),
          message: "Boost complete.",
          items: [...(r.items ?? [])].sort((a, b) => b.freed - a.freed),
          cleaned: r.freed,
          system,
        });
        return r;
      } catch (e) {
        setJob("boost", { ...idle, finishedAt: Date.now(), message: "Boost failed." });
        throw e;
      }
    },
  );
}

/** Optional memory trim. Windows manages RAM well on its own, so this is a
 *  manual tool, not part of Boost. Never touches apps with an open window. */
export async function runMemoryTrim() {
  if (state.trim.running) return;
  await runTask(
    "cleanup:trim",
    {
      label: "Memory trim",
      where: { section: "cleanup" },
      summarize: () => state.trim.message,
    },
    async () => {
      setJob("trim", { ...idle, running: true, message: "Trimming…" });
      try {
        const r = await window.anchor.trimMemory();
        setJob("trim", {
          running: false,
          finishedAt: Date.now(),
          skipped: r.skipped ?? [],
          message: `Trimmed ${r.trimmed} background processes — ${formatBytes(r.freedBytes)} RAM freed, measured system-wide.`,
        });
        return r;
      } catch (e) {
        setJob("trim", { ...idle, finishedAt: Date.now(), message: "Memory trim failed." });
        throw e;
      }
    },
  );
}
