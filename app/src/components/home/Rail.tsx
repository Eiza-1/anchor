// One Home row: a heading with filter chips, and a horizontally scrolling track
// with arrows outside its edges. The arrows scroll ±360px on a spring; trackpads
// and Shift+wheel scroll it natively (the scrollbar is hidden), and a plain mouse
// wheel scrolls it sideways until it reaches an end, then the page scrolls on.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, motion, type AnimationPlaybackControls } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING, SPRING_SOFT, useReduceMotion } from "@/lib/motion";

export interface ChipOption<T extends string> { value: T; label: string }

const STEP = 360;
/** The arrows' scroll: soft, with a touch of overshoot that the edges absorb. */
const SCROLL_SPRING = { type: "spring", stiffness: 170, damping: 24, mass: 1 } as const;

export function Rail<T extends string>({
  id, title, aside, chips, value, onChange, resetKey, children,
}: {
  /** Unique per rail (the chip highlight's layoutId). */
  id: string;
  title: string;
  /** Small extra next to the heading, e.g. the data credit. */
  aside?: React.ReactNode;
  chips: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** When this changes the track scrolls back to the start (e.g. a new filter). */
  resetKey?: string;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const target = useRef(0);
  const reduce = useReduceMotion();
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < max - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  // Re-measure when the track resizes, when a card resizes (a card springing
  // open changes scrollWidth) and when cards come and go. Observers call back
  // asynchronously, never inside a render or layout effect.
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    const watch = () => {
      ro.disconnect();
      ro.observe(el);
      Array.from(el.children).forEach((c) => ro.observe(c));
    };
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    watch();
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [measure]);

  useEffect(() => {
    anim.current?.stop();
    if (track.current) track.current.scrollLeft = 0;
    target.current = 0;
    measure();
  }, [resetKey, measure]);

  useEffect(() => () => anim.current?.stop(), []);

  const scroll = (dir: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // rapid clicks add up from where the last click was heading, not from mid-flight
    const from = anim.current ? target.current : el.scrollLeft;
    const to = Math.max(0, Math.min(max, from + dir * STEP));
    target.current = to;
    anim.current?.stop();
    if (reduce) {
      el.scrollLeft = to;
      anim.current = null;
      return;
    }
    anim.current = animate(el.scrollLeft, to, {
      ...SCROLL_SPRING,
      onUpdate: (v) => { el.scrollLeft = v; },
      onComplete: () => { anim.current = null; },
    });
  };

  // A wheel or trackpad scroll takes over from an arrow's spring. A plain
  // vertical wheel is turned sideways; it needs a non-passive listener to stop
  // the page scrolling too, which React's onWheel can't provide.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (anim.current) { anim.current.stop(); anim.current = null; }
      if (e.shiftKey || e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY; // lines → px
      const max = el.scrollWidth - el.clientWidth;
      if ((dy < 0 && el.scrollLeft <= 0) || (dy > 0 && el.scrollLeft >= max - 1)) return; // at an end: page scrolls
      e.preventDefault();
      el.scrollLeft += dy;
      target.current = el.scrollLeft;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold tracking-tight dark:[text-shadow:0_1px_10px_rgb(0_0_0/0.5)]">{title}</h2>
          {aside}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={`Filter ${title.toLowerCase()}`}>
          {chips.map((c) => {
            const on = c.value === value;
            return (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onChange(c.value)}
                className={cn(
                  "relative rounded px-[7px] py-[3px] text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors duration-200",
                  "border border-foreground/30 dark:border-white/35",
                  on ? "text-primary" : "text-foreground/70 hover:border-foreground/80 hover:text-foreground dark:text-white/75 dark:hover:border-white dark:hover:text-white",
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`chip-${id}`}
                    layoutDependency={value}
                    transition={SPRING}
                    className="absolute -inset-px rounded border border-primary shadow-[inset_0_0_10px_hsl(var(--primary)/0.35)]"
                  />
                )}
                <span className="relative">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <Arrow side="left" shown={edges.left} onClick={() => scroll(-1)} />
        {/* contained: a card springing open re-lays out and repaints this row
            only, not the rest of the page (the track clips its overflow anyway) */}
        <div
          ref={track}
          onScroll={measure}
          className="no-scrollbar -mx-2 flex gap-3 overflow-x-auto px-2 pb-4 pt-3"
          style={{ contain: "layout paint" }}
        >
          {children}
        </div>
        <Arrow side="right" shown={edges.right} onClick={() => scroll(1)} />
      </div>
    </section>
  );
}

function Arrow({ side, shown, onClick }: { side: "left" | "right"; shown: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <motion.button
      type="button"
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={shown ? 0 : -1}
      onClick={onClick}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : side === "left" ? 6 : -6 }}
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.9 }}
      transition={SPRING_SOFT}
      className={cn(
        "absolute top-1/2 z-10 -mt-[30px] grid h-[60px] w-[34px] place-items-center text-foreground/70 transition-colors hover:text-foreground dark:text-white/75 dark:hover:text-white",
        side === "left" ? "-left-[38px]" : "-right-[38px]",
        !shown && "pointer-events-none",
      )}
    >
      <Icon className="size-7 dark:drop-shadow-[0_1px_6px_rgb(0_0_0/0.6)]" strokeWidth={1.5} />
    </motion.button>
  );
}

/** Glass message in place of a row (unavailable, empty). Same height as the cards it replaces. */
export function RailNotice({ title, detail, height, icon }: {
  title: string; detail?: string; height: number; icon?: React.ReactNode;
}) {
  return (
    <div
      className="glass cut-corner flex w-full shrink-0 items-center gap-3 rounded-lg px-6"
      style={{ height }}
    >
      {icon && <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground/[0.06]">{icon}</span>}
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
