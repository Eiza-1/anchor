// Turning raw samples into conclusions.
//
// A big process isn't a leak — Chrome using 2 GB is just Chrome. A leak is memory
// that climbs and never comes back down. So we fit a trend line across samples
// and look at the slope, not the size.

export interface ProcSample {
  name: string; pid: number; private: number; handles: number;
  threads: number; cpuSec: number; ageHours: number; cpuPerHour: number;
}

export interface SystemState {
  bootTime: string;
  uptimeHours: number;
  pending: string[];
  totalMemory: number;
  freeMemory: number;
  nonPagedPool: number;
  pagedPool: number;
  standbyCache: number;
  commitPercent: number;
  pageFileUsedMB: number;
  pageFilePeakMB: number;
  processCount: number;
  handleCount: number;
}

/** Least-squares slope of y over x. */
function slope(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 3) return 0;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export interface LeakSuspect {
  name: string;
  pid: number;
  current: number;
  growthPerHour: number;    // bytes
  handleGrowthPerHour: number;
  confidence: "watching" | "likely" | "strong";
  detail: string;
}

/**
 * @param history snapshots taken over time: [{ t: epochMs, procs: ProcSample[] }]
 */
export function findLeaks(
  history: { t: number; procs: ProcSample[] }[]
): { suspects: LeakSuspect[]; minutesObserved: number } {
  if (history.length < 3) return { suspects: [], minutesObserved: 0 };

  const spanMs = history[history.length - 1].t - history[0].t;
  const minutesObserved = Math.round(spanMs / 60000);

  // group samples per pid
  const byPid = new Map<number, { name: string; points: { x: number; y: number }[]; handles: { x: number; y: number }[]; last: ProcSample }>();
  for (const snap of history) {
    const hours = (snap.t - history[0].t) / 3_600_000;
    for (const p of snap.procs) {
      const entry = byPid.get(p.pid) ?? { name: p.name, points: [], handles: [], last: p };
      entry.points.push({ x: hours, y: p.private });
      entry.handles.push({ x: hours, y: p.handles });
      entry.last = p;
      byPid.set(p.pid, entry);
    }
  }

  const suspects: LeakSuspect[] = [];
  for (const [pid, e] of byPid) {
    if (e.points.length < 3) continue;
    const growth = slope(e.points);              // bytes per hour
    const handleGrowth = slope(e.handles);
    const relative = growth / Math.max(e.last.private, 1);

    // Meaningful growth only: >25 MB/h, and rising by >5% of current size per hour
    const memLeak = growth > 25 * 1024 ** 2 && relative > 0.05;
    const handleLeak = handleGrowth > 500;
    if (!memLeak && !handleLeak) continue;

    const strong = minutesObserved >= 20 && (growth > 100 * 1024 ** 2 || handleGrowth > 2000);
    const parts: string[] = [];
    if (memLeak) parts.push(`memory rising about ${(growth / 1024 ** 2).toFixed(0)} MB every hour`);
    if (handleLeak) parts.push(`handle count climbing by roughly ${Math.round(handleGrowth)} per hour`);

    suspects.push({
      name: e.name,
      pid,
      current: e.last.private,
      growthPerHour: growth,
      handleGrowthPerHour: handleGrowth,
      confidence: minutesObserved < 10 ? "watching" : strong ? "strong" : "likely",
      detail: `${e.name} has ${parts.join(" and ")} over the last ${minutesObserved} minutes without releasing it.`,
    });
  }

  return {
    suspects: suspects.sort((a, b) => b.growthPerHour - a.growthPerHour).slice(0, 6),
    minutesObserved,
  };
}

export interface Advice {
  level: "ok" | "suggest" | "urgent";
  headline: string;
  detail: string;
}

/** Should this PC be restarted, and why exactly? */
export function uptimeAdvice(s: SystemState | null, leakCount: number): Advice {
  if (!s) return { level: "ok", headline: "Checking…", detail: "" };

  const days = s.uptimeHours / 24;
  const pending = s.pending?.length ?? 0;
  const poolMB = s.nonPagedPool / 1024 ** 2;
  const memUsedPct = ((s.totalMemory - s.freeMemory) / s.totalMemory) * 100;

  const reasons: string[] = [];
  if (pending) reasons.push(...s.pending);
  if (days >= 7) reasons.push(`it's been running for ${Math.floor(days)} days without a restart`);
  if (poolMB > 600) reasons.push(`the non-paged pool is at ${Math.round(poolMB)} MB, a sign a driver is leaking memory`);
  if (leakCount > 0) reasons.push(`${leakCount} app${leakCount === 1 ? " appears" : "s appear"} to be leaking memory`);
  if (s.commitPercent > 90) reasons.push(`committed memory is at ${s.commitPercent}%, so Windows is leaning on the page file`);
  if (memUsedPct > 90) reasons.push("physical memory is nearly full");

  if (pending || (days >= 7 && reasons.length > 1) || poolMB > 900)
    return {
      level: "urgent",
      headline: "Restart your PC",
      detail: `A restart would fix this: ${reasons.join("; ")}. Restarting clears leaked memory, finishes queued updates and resets drivers, which no cleanup tool can do.`,
    };

  if (reasons.length)
    return {
      level: "suggest",
      headline: "A restart would help",
      detail: `${reasons.join("; ")}. Not urgent, but a restart is the cleanest fix.`,
    };

  return {
    level: "ok",
    headline: "No restart needed",
    detail: `Up ${s.uptimeHours < 24 ? `${Math.round(s.uptimeHours)} hours` : `${Math.floor(days)} days`}, memory pools look normal, and nothing is waiting on a reboot.`,
  };
}

/** Processes burning CPU quietly in the background. */
export function cpuHogs(procs: ProcSample[]) {
  return procs
    .filter((p) => p.ageHours > 0.25 && p.cpuPerHour > 180) // >5% of a core, sustained
    .sort((a, b) => b.cpuPerHour - a.cpuPerHour)
    .slice(0, 6)
    .map((p) => ({
      ...p,
      // 3600 CPU-seconds per hour = one core fully saturated
      corePercent: Math.min(100, Math.round((p.cpuPerHour / 3600) * 100)),
      totalHours: +(p.cpuSec / 3600).toFixed(1),
    }));
}
