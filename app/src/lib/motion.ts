import { useSyncExternalStore } from "react";

// Shared spring physics. Everything that moves uses one of these so the app
// feels like one material. CSS-only transitions use `--ease-spring` in
// index.css, a linear() sampling of SPRING.

/** Default: quick, with a slight overshoot. */
export const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.9 } as const;

/** Softer, for large movements and backgrounds. */
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 26 } as const;

/** Page and panel entry. No exit, so new content never waits. */
export const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

/* ---------------------------- Reduce animations ---------------------------- */
// Anchor animates by default, whatever Windows' "Animation effects" setting is
// (the springs are part of the app). Account → Appearance → "Reduce animations"
// turns motion down: framer-motion via MotionConfig, CSS via `html.reduce-motion`
// (see index.css). Use these instead of `motion-safe:` / `motion-reduce:` /
// `prefers-reduced-motion` / framer's useReducedMotion, which follow Windows.
const REDUCE_KEY = "anchor:reduce-motion";

function readReduce(): boolean {
  try {
    return localStorage.getItem(REDUCE_KEY) === "1";
  } catch {
    return false;
  }
}

let reduceMotion = typeof window === "undefined" ? false : readReduce();
const reduceSubs = new Set<() => void>();

function applyReduceClass() {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("reduce-motion", reduceMotion);
}
applyReduceClass();

export function setReduceMotion(on: boolean) {
  reduceMotion = on;
  try {
    if (on) localStorage.setItem(REDUCE_KEY, "1");
    else localStorage.removeItem(REDUCE_KEY);
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
  applyReduceClass();
  reduceSubs.forEach((f) => f());
}

export function getReduceMotion() {
  return reduceMotion;
}

/** True when the user switched on "Reduce animations". */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    (f) => { reduceSubs.add(f); return () => { reduceSubs.delete(f); }; },
    getReduceMotion,
  );
}
