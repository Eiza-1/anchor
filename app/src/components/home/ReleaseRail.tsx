// "Game Releases": upcoming games from RAWG as frosted cards. Hovering a card
// springs it open, fades its cover in and hands the art to the app background.
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
const REASONS: Record<string, string> = { "no-key": "No RAWG key set", network: "Couldn't reach RAWG" };

const W_CLOSED = 108;
const W_OPEN = 220;
const H = 140;
/** Opening a card: springy, with a little overshoot, like the mockup's k=300 c=26. */
const OPEN_SPRING = { type: "spring", stiffness: 300, damping: 26, mass: 1 } as const;

/* ---------------------------- hero background ----------------------------- */
// The background only switches once the picture is decoded, so it never fades
// in to an empty frame. Leaving is deferred a moment, so sliding across the
// gap between two cards cross-fades A→B instead of dipping to the theme picture.
let hovered: string | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

function heroEnter(url: string | null) {
  clearTimeout(leaveTimer);
  hovered = url;
  if (!url) { setHeroArt(null); return; }
  const img = new Image();
  img.src = url;
  img.decode().catch(() => {}).finally(() => { if (hovered === url) setHeroArt(url); });
}
function heroLeave() {
  hovered = null;
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
    body = shown.map((g, i) => <ReleaseCard key={`${filter}:${g.id}`} game={g} today={today} index={i} />);
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
  const img = rawgImage(g.image, 640);
  const { day, month } = dayMonth(g.released);
  const isToday = g.released === today;
  const lit = open && !!img; // the cover is showing: text turns white over it
  const delay = Math.min(index, 14) * 0.03;
  const reduce = useReduceMotion();

  return (
    <motion.button
      type="button"
      title={g.name}
      onClick={() => window.anchor.openExternal(g.url)}
      onHoverStart={() => { setOpen(true); heroEnter(img); }}
      onHoverEnd={() => { setOpen(false); heroLeave(); }}
      onFocus={() => { setOpen(true); heroEnter(img); }}
      onBlur={() => { setOpen(false); heroLeave(); }}
      initial={{ opacity: 0, y: 14, flexBasis: `${W_CLOSED}px` }}
      animate={{ opacity: 1, y: open ? -6 : 0, flexBasis: `${open ? W_OPEN : W_CLOSED}px` }}
      transition={{
        flexBasis: reduce ? INSTANT : OPEN_SPRING,
        y: entered.current ? SPRING : { ...SPRING_SOFT, delay },
        opacity: { duration: 0.35, ease: "easeOut", delay: entered.current ? 0 : delay },
      }}
      onAnimationComplete={() => { entered.current = true; }}
      style={{ height: H, background: "hsl(var(--glass-home))", willChange: "transform" }}
      className={cn(
        "glass-blur cut-corner group relative flex shrink-0 grow-0 flex-col overflow-hidden rounded-[3px] px-2.5 pb-2.5 text-left outline-none",
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
            className="absolute inset-0 -z-10 size-full object-cover transition-[opacity,transform] duration-500 ease-spring"
            style={{ opacity: open ? 1 : 0, transform: open ? "scale(1)" : "scale(1.08)" }}
          />
          <div
            className="absolute inset-0 -z-10 bg-gradient-to-b from-black/25 via-black/45 to-black/85 transition-opacity duration-500"
            style={{ opacity: open ? 1 : 0 }}
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
