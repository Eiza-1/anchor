// App-level state that lives OUTSIDE React, so long-running jobs (health check,
// boost) keep running and keep their results when the user switches pages.
// Pages subscribe with useAppState(); the jobs themselves are plain functions here.
import { useSyncExternalStore } from "react";
import { formatBytes } from "@/lib/utils";

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
}

interface AppState {
  health: HealthState;
  boost: BoostState;
}

const initial: AppState = {
  health: { running: false, done: 0, total: 5, lines: [], finishedAt: null },
  boost: { running: false, message: "", skipped: [], finishedAt: null },
};

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
function setBoost(update: (b: BoostState) => BoostState) {
  state = { ...state, boost: update(state.boost) };
  emit();
}

/* --------------------------------- Cache ---------------------------------- *
 * Pages unmount when you navigate. Without this, every visit refetched
 * everything — the main reason the app felt slow. Results are kept here with a
 * TTL, so returning to a page is instant and only stale data is re-requested.  */
type Entry = { value: unknown; at: number; inflight?: Promise<unknown> };
const cache = new Map<string, Entry>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) {
    if (hit.inflight) return hit.inflight as Promise<T>;
    if (Date.now() - hit.at < ttlMs) return hit.value as T;
  }
  const inflight = fn()
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((e) => {
      cache.delete(key);
      throw e;
    });
  cache.set(key, { value: hit?.value, at: hit?.at ?? 0, inflight });
  return inflight as Promise<T>;
}

/** Read whatever is cached right now (for instant first paint), or undefined. */
export function peek<T>(key: string): T | undefined {
  const hit = cache.get(key);
  return hit && !hit.inflight ? (hit.value as T) : (hit?.value as T | undefined);
}

export function invalidate(...keys: string[]) {
  keys.forEach((k) => cache.delete(k));
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
}

/* --------------------------------- Boost --------------------------------- */
export async function runBoost(opts: {
  includeTemp: boolean;
  includeRecycleBin: boolean;
  restorePoint: boolean;
}) {
  if (state.boost.running) return;
  setBoost(() => ({ running: true, message: "", skipped: [], finishedAt: null }));

  if (opts.restorePoint) {
    setBoost((b) => ({ ...b, message: "Creating restore point…" }));
    const rp = await window.anchor.createRestorePoint("Anchor Boost");
    setBoost((b) => ({ ...b, message: rp.ok ? "Restore point created. Boosting…" : `${rp.message} Continuing boost…` }));
  }

  const r = await window.anchor.runBoost({
    includeTemp: opts.includeTemp,
    includeRecycleBin: opts.includeRecycleBin,
  });

  setBoost(() => ({
    running: false,
    finishedAt: Date.now(),
    skipped: r.skipped ?? [],
    message:
      `Trimmed ${r.trimmed} background processes (${formatBytes(r.freedBytes)} RAM freed, measured system-wide) ` +
      `and removed ${r.tempFiles} temp files (${formatBytes(r.tempBytes)}). Open apps were not touched.`,
  }));
}
