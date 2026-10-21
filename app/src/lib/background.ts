/// <reference types="vite/client" />
// The picture behind the whole app: each theme's own, or the user's own picture
// (copied into userData by main/services/background.js). Kept outside React like
// nav.ts so any component can read it without prop drilling.
import { useSyncExternalStore } from "react";
import dark from "@/assets/backgrounds/dark.webp";
import light from "@/assets/backgrounds/light.webp";
import midnight from "@/assets/backgrounds/midnight.webp";
import ember from "@/assets/backgrounds/ember.webp";
import tide from "@/assets/backgrounds/tide.webp";
import crimson from "@/assets/backgrounds/crimson.webp";
import vault from "@/assets/backgrounds/vault.webp";
import amethyst from "@/assets/backgrounds/amethyst.webp";

const PICTURES: Record<string, string> = { dark, light, midnight, ember, tide, crimson, vault, amethyst };

/** The bundled picture for a theme; unknown themes get Dark's. */
export function themeBackground(theme: string): string {
  return PICTURES[theme] ?? PICTURES.dark;
}

/* ------------------------------- store ------------------------------------ */
type Bg = { url: string; custom: boolean };

const currentTheme = () =>
  (typeof document !== "undefined" && document.documentElement.dataset.theme) || "dark";

let custom: string | null = null;
let snapshot: Bg = { url: themeBackground(currentTheme()), custom: false }; // theme-boot.ts has set the saved theme
let loaded = false;
let observer: MutationObserver | null = null;
const listeners = new Set<() => void>();


function recompute() {
  const next: Bg = custom ? { url: custom, custom: true } : { url: themeBackground(currentTheme()), custom: false };
  if (next.url === snapshot.url && next.custom === snapshot.custom) return; // keep snapshot stable
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  // applyTheme() sets <html data-theme>; follow it without coupling to store.ts.
  if (!observer && typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    observer = new MutationObserver(recompute);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    recompute();
  }
  if (!loaded) {
    loaded = true;
    void refreshBackground();
  }
  return () => void listeners.delete(l);
}

export const getBackgroundSnapshot = () => snapshot;

export function useBackground(): Bg {
  return useSyncExternalStore(subscribe, getBackgroundSnapshot, getBackgroundSnapshot);
}

/** Re-reads the user's own picture from main (after picking or resetting one).
 *  It's shown through a blob: URL, so the store, the React key and both <img>s
 *  hold a short string instead of a 20 MB data: URL. */
export async function refreshBackground(): Promise<void> {
  let next: string | null = null;
  try {
    const pic = await window.anchor.getBackground();
    if (pic) next = URL.createObjectURL(new Blob([pic.bytes], { type: pic.type }));
  } catch {
    next = null; // unreadable: fall back to the theme picture
  }
  // already-decoded <img>s (the fading-out layer) keep painting after a revoke
  if (custom) URL.revokeObjectURL(custom);
  custom = next;
  recompute();
}

/* ------------------------------- hero art --------------------------------- */
// Home's release cards set this on hover (Task 8); AppBackground fades it in.
let hero: string | null = null;
const heroListeners = new Set<() => void>();

export function setHeroArt(url: string | null): void {
  if (url === hero) return;
  hero = url;
  heroListeners.forEach((l) => l());
}

const subscribeHero = (l: () => void) => {
  heroListeners.add(l);
  return () => void heroListeners.delete(l);
};
const getHero = () => hero;

export function useHeroArt(): string | null {
  return useSyncExternalStore(subscribeHero, getHero, getHero);
}
