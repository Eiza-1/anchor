// "Game Releases": upcoming games from RAWG as cover-art cards (frosted glass
// for a game with no art). Hovering a card springs it open, shows its details
// and hands the art to the app background.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarX2 } from "lucide-react";
import { Q } from "@/lib/queries";
import { peek } from "@/lib/store";
import { setHeroArt } from "@/lib/background";
import { dayMonth, filterByPlatform, localToday, rawgImage, releaseCountdown } from "@/lib/games";
import { INSTANT, SPRING, SPRING_SOFT, useReduceMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Rail, RailNotice, type ChipOption } from "@/components/home/Rail";
import type { GameRelease, Platform } from "@/types";

type Filter = Platform | "all";
const CHIPS: ChipOption<Filter>[] = [
  { value: "all", label: "All" },
  { value: "pc", label: "PC" },
  { value: "playstation", label: "PlayStation" },
  { value: "xbox", label: "Xbox" },
  { value: "switch", label: "Switch" },
];
const REASONS: Record<string, string> = { "no-key": "Release calendar isn't set up in this build", network: "Couldn't reach RAWG" };

const W_CLOSED = 108;
const W_OPEN = 220;
const H = 140;
/** Opening a card: springy, with a little overshoot, like the mockup's k=300 c=26. */
const OPEN_SPRING = { type: "spring", stiffness: 300, damping: 26, mass: 1 } as const;

/* ---------------------------- hero background ----------------------------- */
// The background only switches once the pointer rests on a card (sweeping
// across the row would otherwise start a full-window cross-fade, and a fresh
// blur, per card it passes) and once the picture is decoded, so it never fades
// in to an empty frame. Leaving is deferred a moment, so sliding across the
// gap between two cards cross-fades A→B instead of dipping to the theme picture.
const HERO_DWELL_MS = 160;
let hovered: string | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
let enterTimer: ReturnType<typeof setTimeout> | undefined;

function heroEnter(url: string | null) {
  clearTimeout(leaveTimer);
  clearTimeout(enterTimer);
  if (!url) { heroLeave(); return; } // an art-less card clears the background like leaving does, deferred
  hovered = url;
  enterTimer = setTimeout(() => {
    if (hovered !== url) return;
    const img = new Image();
    img.src = url;
    img.decode().catch(() => {}).finally(() => { if (hovered === url) setHeroArt(url); });
  }, HERO_DWELL_MS);
}
function heroLeave() {
  hovered = null;
  clearTimeout(enterTimer);
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { if (hovered === null) setHeroArt(null); }, 120);
}

/** Today's date, rolling over at midnight while Home stays open. */
function useToday() {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(() => setToday(localToday()), midnight.getTime() - now.getTime() + 1000);
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

/* --------------------------------- rail ----------------------------------- */
export function ReleaseRail() {
  const [list, setList] = useState<GameRelease[] | undefined>(() => peek<GameRelease[]>("games:releases"));
  const [reason, setReason] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const today = useToday();

  useEffect(() => {
    let live = true;
    Q.releases()
      .then((l) => { if (live) { setList(l); setReason(null); } })
      .catch((e: unknown) => {
        if (live) setReason(e instanceof Error && e.message === "no-key" ? "no-key" : "network");
      });
    return () => {
      live = false;
      clearTimeout(leaveTimer);
      clearTimeout(enterTimer);
      hovered = null;
      setHeroArt(null);
    };
  }, []);

  const shown = useMemo(() => (list ? filterByPlatform(list, filter) : []), [list, filter]);
  const label = CHIPS.find((c) => c.value === filter)!.label;

  let body: React.ReactNode;
  if (!list && !reason) {
    body = Array.from({ length: 9 }, (_, i) => <ReleaseSkeleton key={i} index={i} />);
  } else if (!list) {
    body = (
      <RailNotice
        height={H}
        title="Game releases unavailable"
        detail={REASONS[reason!] ?? REASONS.network}
        icon={<CalendarX2 className="size-5 shrink-0 text-muted-foreground" />}
      />
    );
  } else if (shown.length === 0) {
    body = (
      <RailNotice
        height={H}
        title={filter === "all" ? "No releases in the next 45 days" : `No ${label} releases in the next 45 days`}
        icon={<CalendarX2 className="size-5 shrink-0 text-muted-foreground" />}
      />
    );
  } else {
    // keyed by filter too, so a new filter's cards rise in fresh
    body = [
      ...shown.map((g, i) => <ReleaseCard key={`${filter}:${g.id}`} game={g} today={today} index={i} />),
      // Room for the last card to open into: a card grows by W_OPEN - W_CLOSED
      // to the right, and at the row's end it would open under the edge. (The
      // row's 12px gap comes before this, so it's that much narrower.) Moving
      // the row or overlapping neighbours instead both misbehaved under a
      // moving pointer; empty room needs nothing to move but the card.
      <div key="room" aria-hidden className="shrink-0" style={{ width: W_OPEN - W_CLOSED - 12 }} />,
    ];
  }

  return (
    <Rail
      id="releases"
      title="Game Releases"
      aside={
        <button
          type="button"
          onClick={() => window.anchor.openExternal("https://rawg.io")}
          className="text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Data from RAWG
        </button>
      }
      chips={CHIPS}
      value={filter}
      onChange={setFilter}
      resetKey={filter}
    >
      {body}
    </Rail>
  );
}

/* --------------------------------- card ----------------------------------- */

function ReleaseCard({ game: g, today, index }: { game: GameRelease; today: string; index: number }) {
  const [open, setOpen] = useState(false);
  const entered = useRef(false);
  // a small copy for the card, the bigger one only for the full-window background
  const img = rawgImage(g.image, 420);
  const hero = rawgImage(g.image, 640);
  const { day, month } = dayMonth(g.released);
  const isToday = g.released === today;
  const lit = !!img; // text sits on the cover: white, over a dark fade
  const delay = Math.min(index, 14) * 0.03;
  const reduce = useReduceMotion();
  const show = () => { setOpen(true); heroEnter(hero); };
  const hide = () => { setOpen(false); heroLeave(); };

  return (
    // The slot takes the hover and springs open; it never moves vertically.
    // The card inside lifts as it opens, and if the card itself took the hover,
    // a pointer near its bottom edge would fall off it, end the hover, the card
    // would drop back under the pointer, and the hover would start again.
    <motion.div
      onHoverStart={show}
      onHoverEnd={hide}
      initial={{ flexBasis: `${W_CLOSED}px` }}
      animate={{ flexBasis: `${open ? W_OPEN : W_CLOSED}px` }}
      transition={reduce ? INSTANT : OPEN_SPRING}
      className="relative shrink-0 grow-0"
      style={{ height: H }}
    >
    <motion.button
      type="button"
      title={g.name}
      onClick={() => window.anchor.openExternal(g.url)}
      onFocus={show}
      onBlur={hide}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: open ? -6 : 0 }}
      transition={{
        y: entered.current ? SPRING : { ...SPRING_SOFT, delay },
        opacity: { duration: 0.35, ease: "easeOut", delay: entered.current ? 0 : delay },
      }}
      onAnimationComplete={() => { entered.current = true; }}
      style={{ background: "hsl(var(--glass-home))", willChange: "transform" }}
      className={cn(
        // the cover hides what's behind the card, so only art-less cards pay for a live blur
        img ? "glass" : "glass-blur",
        "cut-corner group relative flex size-full flex-col overflow-hidden rounded-[3px] px-2.5 pb-2.5 text-left outline-none",
        "transition-colors duration-300 focus-visible:ring-1 focus-visible:ring-primary",
        isToday ? "pt-4" : "pt-3",
        lit ? "text-white" : "text-foreground",
      )}
    >
      {img && (
        <>
          <img
            src={img}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={(e) => { e.currentTarget.style.opacity = "1"; }}
            className="absolute inset-0 -z-10 size-full object-cover opacity-0 transition-[opacity,transform] duration-500 ease-spring"
            style={{ transform: open ? "scale(1.06)" : "scale(1)" }}
          />
          {/* darker while closed (more text over less card); lighter once it opens wide */}
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/40 to-black/85 transition-opacity duration-500"
            style={{ opacity: open ? 0.85 : 1 }}
          />
        </>
      )}

      {isToday && (
        <span className="absolute right-0 top-0 bg-primary px-1.5 py-px text-[8.5px] font-extrabold tracking-[0.08em] text-primary-foreground">
          TODAY
        </span>
      )}

      <span
        className={cn(
          "text-[12px] font-semibold leading-[1.3]",
          open ? "line-clamp-2" : "line-clamp-3",
          !lit && "dark:[text-shadow:0_1px_8px_rgb(0_0_0/0.35)]",
          lit && "[text-shadow:0_1px_8px_rgb(0_0_0/0.6)]",
        )}
      >
        {g.name}
      </span>

      {open && (
        // fixed width: revealed by the widening card rather than reflowing with it
        <motion.span
          className="mt-1.5 block w-[196px] text-[11px]"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.06 }}
        >
          {g.genres.length > 0 && (
            <span className="flex gap-1 overflow-hidden">
              {g.genres.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className={cn(
                    "shrink-0 rounded-full px-[7px] py-px text-[10px]",
                    lit ? "bg-white/15 text-white/90" : "bg-foreground/10 text-foreground/80",
                  )}
                >
                  {t}
                </span>
              ))}
            </span>
          )}
          <span className="mt-1 block truncate">
            <b className={cn("font-bold", lit ? "text-white dark:text-primary" : "text-primary")}>
              {releaseCountdown(g.released, today)}
            </b>
            <span className={lit ? "text-white/70" : "text-muted-foreground"}>
              {" · "}{g.added.toLocaleString()} tracking
            </span>
          </span>
        </motion.span>
      )}

      <span className="mt-auto flex items-center gap-2">
        <b className="text-[22px] font-bold leading-none tabular-nums">{day}</b>
        <span className={cn("border-l pl-2 text-[11px] uppercase leading-none tracking-wide", lit ? "border-white/50" : "border-foreground/40 dark:border-white/50")}>
          {month}
        </span>
      </span>
      <span className="mt-2 flex h-[14px] gap-1">
        {g.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}
      </span>
    </motion.button>
    </motion.div>
  );
}

function ReleaseSkeleton({ index }: { index: number }) {
  const reduce = useReduceMotion();
  return (
    <motion.div
      className="glass cut-corner shrink-0 overflow-hidden rounded-[3px] p-2.5 pt-3"
      style={{ width: W_CLOSED, height: H, background: "hsl(var(--glass-home))" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: reduce ? 0.75 : [0.5, 1, 0.5] }}
      transition={reduce ? INSTANT : { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: index * 0.08 }}
    >
      <div className="h-2.5 w-4/5 rounded bg-foreground/15" />
      <div className="mt-1.5 h-2.5 w-3/5 rounded bg-foreground/15" />
      <div className="mt-[62px] h-5 w-1/2 rounded bg-foreground/15" />
      <div className="mt-2 h-3 w-2/5 rounded-full bg-foreground/10" />
    </motion.div>
  );
}

/* ----------------------------- platform glyphs ----------------------------- */
// Lucide has no console marks; these are plain, circled glyphs in the mockup's style.
const PLATFORM_NAME: Record<Platform, string> = { pc: "PC", playstation: "PlayStation", xbox: "Xbox", switch: "Nintendo Switch" };

function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <svg viewBox="0 0 16 16" className="size-[14px] shrink-0 opacity-90" aria-label={PLATFORM_NAME[platform]} role="img">
      <title>{PLATFORM_NAME[platform]}</title>
      <circle cx="8" cy="8" r="7.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {platform === "pc" && (
        <g fill="currentColor">
          <rect x="4.6" y="4.6" width="3" height="3" rx=".3" />
          <rect x="8.4" y="4.6" width="3" height="3" rx=".3" />
          <rect x="4.6" y="8.4" width="3" height="3" rx=".3" />
          <rect x="8.4" y="8.4" width="3" height="3" rx=".3" />
        </g>
      )}
      {platform === "playstation" && (
        <text x="8" y="10.9" textAnchor="middle" fontSize="8" fontWeight="800" fill="currentColor"
          fontFamily="Segoe UI, system-ui, sans-serif">P</text>
      )}
      {platform === "xbox" && (
        <path d="M5.2 5.2 10.8 10.8M10.8 5.2 5.2 10.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
      {platform === "switch" && (
        <g fill="none" stroke="currentColor" strokeWidth="1.1">
          <path d="M7.6 4.3H6.1a1.6 1.6 0 0 0-1.6 1.6v4.2a1.6 1.6 0 0 0 1.6 1.6h1.5z" />
          <path d="M8.4 4.3h1.5a1.6 1.6 0 0 1 1.6 1.6v4.2a1.6 1.6 0 0 1-1.6 1.6H8.4z" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}
