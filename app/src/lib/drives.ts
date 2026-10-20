export type VolumeStats = {
  total: number; free: number; used: number; usedPct: number; freePct: number;
  level: "ok" | "low" | "critical";
};

export function volumeStats(v: { FreeSpace?: number | null; Size?: number | null }): VolumeStats {
  const total = Number(v.Size) > 0 ? Number(v.Size) : 0;
  if (!total) return { total: 0, free: 0, used: 0, usedPct: 0, freePct: 0, level: "ok" };
  const free = Math.min(Math.max(Number(v.FreeSpace) || 0, 0), total);
  const used = total - free;
  const freePct = (free / total) * 100;
  return {
    total, free, used, usedPct: (used / total) * 100, freePct,
    level: freePct < 5 ? "critical" : freePct < 10 ? "low" : "ok",
  };
}

export function tempInfo(
  temp: number | null | undefined, admin: boolean,
): { text: string; tone: "normal" | "warm" | "hot" | "muted" } {
  if (typeof temp === "number" && temp > 0)
    return { text: `${temp}°C`, tone: temp > 70 ? "hot" : temp > 55 ? "warm" : "normal" };
  return admin
    ? { text: "Not reported by this drive", tone: "muted" }
    : { text: "Run Anchor as admin to read temperature", tone: "muted" };
}
