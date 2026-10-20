// Shared spring physics. Everything that moves uses one of these so the app
// feels like one material. CSS-only transitions use `--ease-spring` in
// index.css, a linear() sampling of SPRING.

/** Default: quick, with a slight overshoot. */
export const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.9 } as const;

/** Softer, for large movements and backgrounds. */
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 26 } as const;

/** Page and panel entry. No exit, so new content never waits. */
export const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
