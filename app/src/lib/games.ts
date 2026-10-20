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
