// "Free games": current Steam / Epic / GOG giveaways from GamerPower, as tall
// covers that tilt toward the pointer on a spring.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion, useMotionTemplate, useReducedMotion, useSpring, useTransform,
} from "framer-motion";
import { Gift } from "lucide-react";
import { Q } from "@/lib/queries";
import { peek } from "@/lib/store";
import { dayMonth } from "@/lib/games";
import { SPRING_SOFT } from "@/lib/motion";
import { Rail, RailNotice, type ChipOption } from "@/components/home/Rail";
import type { FreeGame } from "@/types";

type Filter = FreeGame["store"] | "all";
const CHIPS: ChipOption<Filter>[] = [
  { value: "all", label: "All" },
  { value: "steam", label: "Steam" },
  { value: "epic", label: "Epic" },
  { value: "gog", label: "GOG" },
];
const STORE_NAME: Record<FreeGame["store"], string> = { steam: "Steam", epic: "Epic", gog: "GOG" };

const W = 160;
const H = 220;
const MAX_TILT = 8;
/** Tilt follows the pointer closely but settles with a little wobble. */
const TILT_SPRING = { stiffness: 260, damping: 20, mass: 0.6 };

export function FreeRail() {
  const [list, setList] = useState<FreeGame[] | undefined>(() => peek<FreeGame[]>("games:free"));
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let live = true;
    Q.freeGames()
      .then((l) => { if (live) { setList(l); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const shown = useMemo(
    () => (list ? (filter === "all" ? list : list.filter((g) => g.store === filter)) : []),
    [list, filter],
  );

  let body: React.ReactNode;
  if (!list && !failed) {
    body = Array.from({ length: 6 }, (_, i) => <FreeSkeleton key={i} index={i} />);
  } else if (!list) {
    body = <RailNotice height={H} title="Free games unavailable" detail="Couldn't reach GamerPower" icon={<GiftIcon />} />;
  } else if (shown.length === 0) {
    body = (
      <RailNotice
        height={H}
        title={filter === "all" ? "No free games right now" : `No free ${STORE_NAME[filter]} games right now`}
        detail="Giveaways come and go — check back in a day or two."
        icon={<GiftIcon />}
      />
    );
  } else {
    body = shown.map((g, i) => <FreeCard key={`${filter}:${g.id}`} game={g} index={i} />);
  }

  return (
    <Rail id="free" title="Free games" chips={CHIPS} value={filter} onChange={setFilter} resetKey={filter}>
      {body}
    </Rail>
  );
}

const GiftIcon = () => <Gift className="size-5 shrink-0 text-muted-foreground" />;

function FreeCard({ game: g, index }: { game: FreeGame; index: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const rx = useSpring(0, TILT_SPRING);
  const ry = useSpring(0, TILT_SPRING);
  const scale = useSpring(1, TILT_SPRING);
  // a soft sheen that sits where the pointer is
  const px = useSpring(50, TILT_SPRING);
  const py = useSpring(30, TILT_SPRING);
  const sheen = useMotionTemplate`radial-gradient(220px circle at ${px}% ${py}%, rgb(255 255 255 / 0.2), transparent 60%)`;
  const sheenOpacity = useTransform(scale, [1, 1.05], [0, 1]);
  const until = g.endDate ? dayMonth(g.endDate) : null;

  const onMove = (e: React.PointerEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    ry.set((fx - 0.5) * 2 * MAX_TILT);
    rx.set(-(fy - 0.5) * 2 * MAX_TILT);
    px.set(fx * 100);
    py.set(fy * 100);
    scale.set(1.05);
  };
  const onLeave = () => { rx.set(0); ry.set(0); scale.set(1); };

  return (
    <motion.button
      ref={ref}
      type="button"
      title={g.title}
      onClick={() => window.anchor.openExternal(g.url)}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: Math.min(index, 10) * 0.04 }}
      style={{ width: W, height: H, rotateX: rx, rotateY: ry, scale, transformPerspective: 700 }}
      className="cut-corner group relative shrink-0 overflow-hidden rounded-md bg-black/40 text-left text-white outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <img
        src={g.image}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-spring group-hover:scale-[1.08]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent via-40% to-black/80" />
      <motion.div className="pointer-events-none absolute inset-0" style={{ background: sheen, opacity: sheenOpacity }} />
      <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-white/15" />

      <span className="absolute right-0 top-0 bg-black/75 px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-white/90">
        {STORE_NAME[g.store]}
      </span>

      <span className="absolute inset-x-2.5 bottom-10 line-clamp-3 text-[18px] font-extrabold italic leading-[1.1] [text-shadow:0_2px_10px_rgb(0_0_0/0.7)]">
        {g.title}
      </span>

      <span className="absolute bottom-3 left-2.5 flex items-center gap-2">
        <span className="-skew-x-[8deg] bg-primary px-2 py-0.5 text-[11px] font-extrabold text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.5)]">
          FREE
        </span>
        {(until || g.worth) && (
          <span className="-translate-x-1.5 whitespace-nowrap text-[10px] text-white/90 opacity-0 transition-[opacity,transform] duration-300 ease-spring group-hover:translate-x-0 group-hover:opacity-100">
            {g.worth && <s className="mr-1 text-white/55">{g.worth}</s>}
            {until && `until ${until.month} ${until.day}`}
          </span>
        )}
      </span>
    </motion.button>
  );
}

function FreeSkeleton({ index }: { index: number }) {
  return (
    <motion.div
      className="glass cut-corner shrink-0 rounded-md"
      style={{ width: W, height: H }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.45, 0.9, 0.45] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: index * 0.1 }}
    />
  );
}
