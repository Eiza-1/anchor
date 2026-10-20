import type { GameRelease, Platform } from "@/types";

const toUtcDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export function releaseCountdown(released: string, today: string): string {
  const n = toUtcDay(released) - toUtcDay(today);
  if (!(n >= 1)) return "Out today";
  return n === 1 ? "In 1 day" : `In ${n} days`;
}

export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function filterByPlatform(list: GameRelease[], p: Platform | "all"): GameRelease[] {
  return p === "all" ? list : list.filter((g) => g.platforms.includes(p));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-07" → { day: 7, month: "Oct" } (no Date parsing, so no timezone drift). */
export function dayMonth(ymd: string): { day: number; month: string } {
  const [, m, d] = ymd.split("-").map(Number);
  return { day: d || 0, month: MONTHS[(m || 1) - 1] ?? "" };
}

/** RAWG serves resized copies at /media/resize/{w}/-/...; full-size art is often 1–3 MB. */
export function rawgImage(url: string | null, width: number): string | null {
  if (!url) return null;
  return url.replace(/^(https:\/\/media\.rawg\.io\/media\/)(?!resize\/|crop\/)/, `$1resize/${width}/-/`);
}

/** "1 hour ago", "3 days ago" — for "last checked …". */
export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (s < 60) return "just now";
  if (s < 3600) return unit(Math.floor(s / 60), "minute");
  if (s < 86_400) return unit(Math.floor(s / 3600), "hour");
  return unit(Math.floor(s / 86_400), "day");
}
