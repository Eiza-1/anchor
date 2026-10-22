// The app's sidebar: translucent glass over the background picture, a gliding
// active highlight, and an open/closed state remembered across launches. When
// closed it stays a 64px icon rail; hovering peeks it open OVER the page (the
// layout slot stays 64px, so nothing behind it moves). Opening or closing it for
// good changes the slot's width in one step, never per frame: re-laying out the
// whole page every frame is what made it judder. The panel itself still springs
// (it's out of flow and contained), and App slides the page across to match.
import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Anchor as AnchorIcon, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { INSTANT, SPRING, useReduceMotion } from "@/lib/motion";
import { navigate } from "@/lib/nav";
import { useRunningSections } from "@/lib/tasks";

export type SidebarItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Starts a labelled group (a divider with this text above the item). */
  group?: string;
};

const OPEN_W = 224;
const CLOSED_W = 64;
const STORE_KEY = "anchor:sidebar";

/** A little bouncier than the default, so the highlight lands with a settle. */
const HIGHLIGHT_SPRING = { ...SPRING, damping: 28 };
/** Icons are small and light, so they can be springier still. */
const ICON_SPRING = { type: "spring", stiffness: 520, damping: 16, mass: 0.6 } as const;
const FADE = { type: "spring", stiffness: 380, damping: 34 } as const;

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== "closed";
  } catch {
    return true;
  }
}
function writeOpen(open: boolean) {
  try {
    localStorage.setItem(STORE_KEY, open ? "open" : "closed");
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}

const iconVariants: Variants = {
  rest: { scale: 1, rotate: 0 },
  hover: { scale: 1.15, rotate: -6 },
  tap: { scale: 0.92, rotate: -6 },
};

export function Sidebar({
  items, account, active, version, onResize,
}: {
  items: SidebarItem[];
  account: SidebarItem;
  active: string;
  version: string;
  /** Runs `commit` (the open/closed change) so the page can measure around it. */
  onResize?: (commit: () => void) => void;
}) {
  const [open, setOpen] = useState(readOpen);
  const [peek, setPeek] = useState(false);
  // After closing with the button the cursor is still over the sidebar; don't
  // peek straight back open until it has left once.
  const suppress = useRef(false);
  const hovered = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const running = useRunningSections();

  useEffect(() => () => clearTimeout(timer.current), []);

  const expanded = open || peek;
  const reduce = useReduceMotion();
  const peeking = !open && peek;

  // lets the page's title strip stop being a drag region under the peek (index.css .title-drag)
  useEffect(() => {
    document.documentElement.toggleAttribute("data-sidebar-peek", peeking);
    return () => document.documentElement.removeAttribute("data-sidebar-peek");
  }, [peeking]);

  function toggle() {
    const next = !open;
    const commit = () => { setOpen(next); setPeek(false); };
    if (onResize) onResize(commit);
    else commit();
    writeOpen(next);
    clearTimeout(timer.current);
    // only when the pointer is actually over it (not a keyboard close)
    if (!next && hovered.current) suppress.current = true;
  }

  // small hover intent on the way in (no peek when the cursor merely crosses),
  // a short grace on the way out (no snap shut when it slips off the edge)
  function enter() {
    hovered.current = true;
    if (open || suppress.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeek(true), 70);
  }
  function leave() {
    hovered.current = false;
    suppress.current = false;
    clearTimeout(timer.current);
    if (!open) timer.current = setTimeout(() => setPeek(false), 120);
  }

  const row = (item: SidebarItem) => (
    <NavItem
      key={item.id}
      item={item}
      active={active === item.id}
      running={running.has(item.id)}
      expanded={expanded}
    />
  );

  return (
    // layout slot: the only thing the page flows around
    <div className="relative h-full shrink-0" style={{ width: open ? OPEN_W : CLOSED_W }}>
      <motion.aside
        aria-label="Main navigation"
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={(e) => { if (!open && e.target.matches(":focus-visible")) setPeek(true); }}
        onBlur={(e) => { if (!open && !e.currentTarget.contains(e.relatedTarget as Node)) setPeek(false); }}
        className={cn(
          "absolute inset-y-0 left-0 flex flex-col overflow-hidden",
          "border-r border-[hsl(var(--glass-edge))] bg-[hsl(var(--glass))] backdrop-blur-xl backdrop-saturate-150",
          peeking ? "z-50" : "z-30"
        )}
        style={{ contain: "layout paint" }}
        initial={false}
        animate={{ width: expanded ? OPEN_W : CLOSED_W }}
        transition={reduce ? INSTANT : SPRING}
      >
        {/* light catching the glass edge */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/20 via-white/5 to-transparent" />

        {/* brand row (draggable title bar) with the open/close arrow. Not draggable
            while peeking: Electron reports the pointer entering a drag region as a
            mouseleave, so the peek would shut on the way to the Keep open button.
            no-drag here also masks the page's title strip underneath the peek. */}
        <div
          className="flex h-12 shrink-0 items-center gap-2.5 pl-6 pr-3"
          style={{ WebkitAppRegion: peeking ? "no-drag" : "drag" } as React.CSSProperties}
        >
          <AnchorIcon className="size-4 shrink-0 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />
          <motion.span
            className="whitespace-nowrap text-sm font-semibold tracking-tight"
            initial={false}
            animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -4 }}
            transition={FADE}
          >
            Anchor
          </motion.span>
          <button
            type="button"
            onClick={toggle}
            aria-label={open ? "Close sidebar" : "Keep sidebar open"}
            aria-expanded={open}
            title={open ? "Close sidebar" : "Keep open"}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <motion.span initial={false} animate={{ rotate: open ? 0 : 180 }} transition={SPRING} className="grid place-items-center">
              <ChevronLeft className="size-4" />
            </motion.span>
          </button>
        </div>

        <motion.nav layoutScroll className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-1.5">
          {items.map((item) => (
            <div key={item.id}>
              {item.group && <GroupDivider label={item.group} expanded={expanded} />}
              {row(item)}
            </div>
          ))}
        </motion.nav>

        <div className="relative shrink-0 px-2.5 pb-3 pt-2.5">
          <div aria-hidden className="absolute inset-x-3 top-0 h-px bg-foreground/10" />
          {row(account)}
          <motion.p
            className="whitespace-nowrap px-3.5 pt-1.5 text-[10px] tabular-nums text-muted-foreground/70"
            initial={false}
            animate={{ opacity: expanded ? 1 : 0 }}
            transition={FADE}
          >
            v{version}
          </motion.p>
        </div>
      </motion.aside>

      {/* peek shadow: its own layer so only opacity animates */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-40"
        style={{ width: OPEN_W, boxShadow: "14px 0 36px -6px rgb(0 0 0 / 0.55)" }}
        initial={false}
        animate={{ opacity: peeking ? 1 : 0 }}
        transition={FADE}
      />
    </div>
  );
}

function GroupDivider({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <div className="relative mt-2 h-[30px]" role="presentation">
      <div className="absolute inset-x-3 top-2 h-px bg-foreground/10" />
      <motion.span
        className="absolute bottom-1 left-3.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60"
        initial={false}
        animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -4 }}
        transition={FADE}
      >
        {label}
      </motion.span>
    </div>
  );
}

function NavItem({
  item, active, running, expanded,
}: {
  item: SidebarItem;
  active: boolean;
  running: boolean;
  expanded: boolean;
}) {
  const Icon = item.icon;
  return (
    <motion.button
      type="button"
      onClick={() => navigate({ section: item.id })}
      aria-current={active ? "page" : undefined}
      aria-label={running ? `${item.label} (task running)` : undefined}
      title={expanded ? undefined : item.label}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="tap"
      className={cn(
        "group relative my-0.5 flex h-9 w-full items-center gap-3 rounded-lg px-3.5 text-left text-sm transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {active && (
        <motion.div
          layoutId="nav-active"
          transition={HIGHLIGHT_SPRING}
          className="absolute inset-0 rounded-lg bg-foreground/[0.08] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]"
        >
          <span className="absolute inset-y-[9px] left-0 w-[3px] rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
        </motion.div>
      )}
      {/* hover wash for inactive rows, under the content */}
      {!active && (
        <span aria-hidden className="absolute inset-0 rounded-lg bg-foreground/0 transition-colors duration-200 group-hover:bg-foreground/[0.04]" />
      )}

      <span className="relative grid size-4 shrink-0 place-items-center">
        <motion.span variants={iconVariants} transition={ICON_SPRING} className="grid place-items-center">
          <Icon className={cn("size-4", active && "text-primary")} />
        </motion.span>
        {running && !expanded && <RunDot className="absolute -right-1.5 -top-1.5" />}
      </span>

      <motion.span
        className="relative truncate whitespace-nowrap"
        initial={false}
        animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -4 }}
        transition={FADE}
      >
        {item.label}
      </motion.span>

      {running && expanded && <RunDot className="relative ml-auto" />}
    </motion.button>
  );
}

function RunDot({ className }: { className?: string }) {
  const reduce = useReduceMotion();
  return (
    <motion.span
      aria-hidden
      className={cn("grid size-[7px] shrink-0 place-items-center", className)}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={ICON_SPRING}
    >
      <span className="absolute size-[7px] animate-ping [.reduce-motion_&]:animate-none rounded-full bg-primary/60" />
      <motion.span
        className="size-[7px] rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.9)]"
        animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [1, 0.45, 1], scale: [1, 0.75, 1] }}
        transition={reduce ? INSTANT : { duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.span>
  );
}
