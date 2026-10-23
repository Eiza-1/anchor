import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** What Anchor should call you: your chosen name wins over the provider's. */
export function displayNameOf(p: { displayName?: string; name?: string; email?: string } | null) {
  return (p?.displayName || p?.name || "").trim();
}

export function greetingFor(p: { displayName?: string; name?: string } | null) {
  const h = new Date().getHours();
  const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = displayNameOf(p);
  return name ? `${time}, ${name}!` : `${time}! Welcome to Anchor.`;
}

export function formatBytes(b: number): string {
  if (b >= 1 << 30) return `${(b / (1 << 30)).toFixed(2)} GB`;
  if (b >= 1 << 20) return `${(b / (1 << 20)).toFixed(1)} MB`;
  if (b >= 1 << 10) return `${Math.round(b / (1 << 10))} KB`;
  return `${b} B`;
}

/** "Removed 3 apps", or "Removed 2 of 3 apps" when some failed. */
export function countSummary(verb: string, done: number, total: number, noun: string): string {
  const of = done < total ? `${done} of ${total}` : `${done}`;
  return `${verb} ${of} ${noun}${(done < total ? total : done) === 1 ? "" : "s"}`;
}
