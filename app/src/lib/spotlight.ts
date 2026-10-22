// Tech Spotlight helpers: relative times and Today / Yesterday / Earlier groups.

const DAY = 864e5;
const startOfDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "5m ago", "3h ago", "Yesterday", then a short date. Blank when undated. */
export function timeAgo(t: number, now = Date.now()): string {
  if (!t) return "";
  const mins = Math.max(1, Math.round((now - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const today = startOfDay(now);
  if (t >= today) return `${Math.round(mins / 60)}h ago`;
  if (t >= today - DAY) return "Yesterday";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type DayLabel = "Today" | "Yesterday" | "Earlier";

/** Groups items by calendar day, in that order; empty groups are left out. */
export function groupByDay<T extends { published: number }>(items: T[], now = Date.now()) {
  const today = startOfDay(now);
  const groups: Record<DayLabel, T[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const i of items) {
    groups[i.published >= today ? "Today" : i.published >= today - DAY ? "Yesterday" : "Earlier"].push(i);
  }
  return (Object.keys(groups) as DayLabel[])
    .filter((label) => groups[label].length)
    .map((label) => ({ label, items: groups[label] }));
}
