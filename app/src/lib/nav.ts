// Which page (section) and tab the user is looking at, kept OUTSIDE React so the
// task tracker can tell whether a finished task's results are already on screen.
// The open tab of each section is remembered, so returning to a section lands
// on the tab you left.
import { useSyncExternalStore } from "react";

export type NavTarget = { section: string; tab?: string };

const lastTab: Record<string, string> = {};
let nav: NavTarget = { section: "home" };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
export const subscribeNav = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const getNav = () => nav;
export function useNav(): NavTarget {
  return useSyncExternalStore(subscribeNav, getNav, getNav);
}

export function navigate(t: NavTarget) {
  if (t.tab) lastTab[t.section] = t.tab;
  const tab = t.tab ?? lastTab[t.section];
  if (nav.section === t.section && nav.tab === tab) return; // keep the snapshot stable
  nav = tab ? { section: t.section, tab } : { section: t.section };
  emit();
}

/** True when the section matches and, if a tab is given, that tab is open. */
export function isViewing(t: NavTarget): boolean {
  return nav.section === t.section && (t.tab === undefined || t.tab === nav.tab);
}

/** How a finished task is announced: an in-app toast unless its page is on
 *  screen, and a Windows notification too when Anchor isn't focused — a page
 *  left open behind another window doesn't count as seen. Main re-checks focus. */
export function announce(t: NavTarget, focused: boolean): { toast: boolean; notify: boolean } {
  const viewing = isViewing(t);
  return { toast: !viewing, notify: !viewing || !focused };
}
