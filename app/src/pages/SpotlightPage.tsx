import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MonitorPlay, Newspaper, Play, RefreshCw } from "lucide-react";
import { Button, Card, PageTitle, Skeleton } from "@/components/ui";
import { Rail } from "@/components/home/Rail";
import { invalidate, peek } from "@/lib/store";
import { articles as loadArticles, Q } from "@/lib/queries";
import { SPRING } from "@/lib/motion";
import { groupByDay, timeAgo } from "@/lib/spotlight";
import { preloadImages, prepareThumbs, useThumb } from "@/lib/thumbs";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/types";

type Mode = "articles" | "videos";
const ALL = "All sources";
/** Article picture widths (CSS px) they're shrunk to: the lead card, and a grid card with a little headroom. */
const LEAD_W = 640;
const CARD_W = 360;
/** Videos below the lead: the "Up next" column, then the grid. */
const UP_NEXT = 4;
const VIDEO_GRID = 40;
const HOVER = "cursor-pointer transition-[transform,background-color] duration-spring ease-spring hover:-translate-y-0.5 hover:bg-accent/70";
const open = (item: NewsItem) => () => window.anchor.openExternal(item.link);

export default function SpotlightPage() {
  const [mode, setMode] = useState<Mode>("articles");
  // seed from cache so the page paints instantly, even on a fresh launch
  const [articles, setArticles] = useState<NewsItem[] | null>(peek<NewsItem[]>("news:articles") ?? null);
  const [videos, setVideos] = useState<NewsItem[] | null>(peek<NewsItem[]>("news:videos") ?? null);
  const [sources, setSources] = useState<{ articles: string[]; videos: string[] }>(
    peek("news:feeds") ?? { articles: [], videos: [] }
  );
  const [filter, setFilter] = useState(ALL);
  const [loading, setLoading] = useState(false);
  // YouTube's feed server sometimes fails for every channel; the cache then keeps the last good list.
  const [videosFailed, setVideosFailed] = useState(false);
  const [logos, setLogos] = useState(peek<SourceLogos>("news:logos") ?? null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    if (force) invalidate("news:articles", "news:videos");
    // With nothing on screen yet, show each feed as it lands; otherwise swap in
    // the fresh list once it's complete so the page doesn't reshuffle mid-read.
    const showPartial = peek("news:articles") === undefined;
    await Promise.all([
      loadArticles(showPartial ? setArticles : undefined).then(setArticles, () => {}),
      Q.videos().then(
        (v) => { setVideos(v); setVideosFailed(false); },
        () => { setVideos(peek<NewsItem[]>("news:videos") ?? []); setVideosFailed(true); }
      ),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    Q.feeds().then(setSources, () => {});
    Q.logos().then(setLogos, () => {});
    load();
  }, [load]);

  useEffect(() => setFilter(ALL), [mode]);

  // fetch the video thumbnails ahead, so Videos opens with them showing instead of grey boxes
  useEffect(() => {
    preloadImages(shownVideos(videos ?? []).map((v) => v.imageUrl));
  }, [videos]);

  const list = mode === "videos" ? videos : articles;
  const filtered = list?.filter((i) => filter === ALL || i.source === filter) ?? null;

  // feed order first, then anything the feeds list doesn't name; sources with nothing to show are left out
  const counts = new Map<string, number>();
  for (const i of list ?? []) counts.set(i.source, (counts.get(i.source) ?? 0) + 1);
  const named = mode === "videos" ? sources.videos : sources.articles;
  const chips = [...new Set([...named, ...counts.keys()])].filter((s) => counts.get(s));

  return (
    <Logos.Provider value={{ urls: logos?.[mode] ?? {}, round: mode === "videos" }}>
    <div className="page-column space-y-6 py-6">
      <div>
        <PageTitle>Tech Spotlight</PageTitle>
        <p className="mt-1 text-sm text-foreground/80 dark:[text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
          Latest tech news and videos from public feeds. No accounts, no tracking. Click anything to open it in your browser.
        </p>
      </div>

      <div className="flex items-start gap-3">
        {chips.length > 0 && (
          <div className="flex flex-1 flex-wrap gap-1.5" role="tablist" aria-label="Filter by source">
            {[ALL, ...chips].map((s) => (
              <SourceChip
                key={s}
                label={s === ALL ? "All" : s}
                count={s === ALL ? list?.length ?? 0 : counts.get(s) ?? 0}
                on={filter === s}
                onClick={() => setFilter(s)}
              />
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => load(true)} loading={loading}>
          {!loading && <RefreshCw />} Refresh
        </Button>
      </div>

      {mode === "videos" && videosFailed && (videos?.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          YouTube's video feeds aren't responding, so these are from last time.
        </p>
      ) : (
        <Card role="status" className="p-10 text-center text-sm text-muted-foreground">
          YouTube's video feeds aren't responding. Anchor retries when you reopen this page or press Refresh.
        </Card>
      ))}

      {filtered === null ? (
        <LoadingState />
      ) : filtered.length === 0 && mode === "videos" && videosFailed ? null : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Nothing from {filter === ALL ? "these feeds" : filter} right now. Try Refresh.
        </Card>
      ) : mode === "videos" ? (
        <Videos items={filtered} />
      ) : (
        <Articles items={filtered.slice(0, 60)} />
      )}

      <ModeSwitch value={mode} onChange={setMode} />
    </div>
    </Logos.Provider>
  );
}

/** Articles / Videos as a pill floating at the bottom of the page while you scroll. */
function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const options = [
    { value: "articles" as const, label: "Articles", icon: Newspaper },
    { value: "videos" as const, label: "Videos", icon: MonitorPlay },
  ];
  return (
    <div ref={ref} className="pointer-events-none sticky bottom-5 z-20 flex justify-center">
      <div
        role="tablist"
        aria-label="Show"
        className="glass-strong pointer-events-auto flex gap-1 rounded-full p-1.5 shadow-[0_10px_40px_-8px_rgb(0_0_0/0.6)]"
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                if (on) return;
                onChange(o.value);
                // the other list starts at its top, not wherever this one was scrolled to
                ref.current?.closest("main")?.scrollTo({ top: 0 });
              }}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {on && <motion.span layoutId="spotlight-mode" layoutDependency={value} transition={SPRING} className="absolute inset-0 rounded-full bg-primary" />}
              <o.icon className="relative size-4" />
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Articles ------------------------------ */

function Articles({ items }: { items: NewsItem[] }) {
  const [lead, ...rest] = items;
  // shrink every picture in list order now, so they're small before you scroll to them
  useEffect(() => {
    prepareThumbs([items[0]?.imageUrl ?? null], LEAD_W);
    prepareThumbs(items.slice(1).map((a) => a.imageUrl), CARD_W);
  }, [items]);
  return (
    <div className="space-y-7">
      <Card onClick={open(lead)} className={cn("group grid overflow-hidden md:grid-cols-[1.35fr_1fr]", HOVER)}>
        <Thumb src={lead.imageUrl} className="aspect-video md:aspect-auto md:min-h-[280px]" width={LEAD_W} height={360} />
        <div className="flex flex-col justify-center gap-2.5 p-6 md:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
            Top story{lead.published ? ` · ${timeAgo(lead.published)}` : ""}
          </p>
          <h2 className="text-[22px] font-bold leading-snug tracking-tight">{lead.title}</h2>
          {lead.summary && <p className="line-clamp-3 text-sm leading-relaxed text-foreground/75">{lead.summary}</p>}
          <SourceMeta item={lead} withTime={false} />
        </div>
      </Card>

      {groupByDay(rest).map((g) => (
        <section key={g.label} className="space-y-3">
          <DayHeading label={g.label} />
          <CardGrid>
            {g.items.map((a) => (
              <Card key={a.link} onClick={open(a)} className={cn("group flex flex-col overflow-hidden", HOVER)}>
                <Thumb src={a.imageUrl} className="aspect-video" width={CARD_W} height={203} />
                <div className="flex flex-1 flex-col gap-1.5 p-3.5 pb-4">
                  <p className="line-clamp-3 text-sm font-semibold leading-snug">{a.title}</p>
                  {a.summary && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{a.summary}</p>}
                  <SourceMeta item={a} className="mt-auto pt-1" />
                </div>
              </Card>
            ))}
          </CardGrid>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------- Videos ------------------------------- */

/** The long videos Videos shows: the lead, "Up next" and the grid, in that order. */
const shownVideos = (items: NewsItem[]) => items.filter((v) => !v.isShort).slice(0, 1 + UP_NEXT + VIDEO_GRID);

function Videos({ items }: { items: NewsItem[] }) {
  const shorts = items.filter((v) => v.isShort).slice(0, 24);
  const [lead, ...rest] = shownVideos(items);
  const upNext = rest.slice(0, UP_NEXT);
  const more = rest.slice(UP_NEXT);

  return (
    <div className="space-y-7">
      {lead && (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <VideoCard video={lead} large />
          {upNext.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">Up next</p>
              {upNext.map((v) => (
                <Card key={v.link} onClick={open(v)} className={cn("group grid grid-cols-[150px_1fr] items-center gap-3 p-2", HOVER)}>
                  <VideoThumb video={v} className="rounded-md" />
                  <div className="min-w-0 space-y-1">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{v.title}</p>
                    <p className="text-xs text-muted-foreground">{v.source} · {timeAgo(v.published)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {shorts.length > 0 && (
        <Rail id="spotlight-shorts" title={`Shorts · ${shorts.length}`} chips={[]} value="" onChange={() => {}}>
          {shorts.map((v) => <ShortCard key={v.link} video={v} />)}
        </Rail>
      )}

      {groupByDay(more).map((g) => (
        <section key={g.label} className="space-y-3">
          <DayHeading label={g.label} />
          <CardGrid>
            {g.items.map((v) => <VideoCard key={v.link} video={v} />)}
          </CardGrid>
        </section>
      ))}
    </div>
  );
}

function VideoCard({ video, large }: { video: NewsItem; large?: boolean }) {
  return (
    <Card onClick={open(video)} className={cn("group overflow-hidden", HOVER)}>
      <VideoThumb video={video} />
      <div className={cn("space-y-1.5", large ? "p-4" : "p-3.5 pb-4")}>
        <p className={cn("line-clamp-2 font-semibold leading-snug", large ? "text-lg" : "text-sm")}>{video.title}</p>
        <SourceMeta item={video} />
      </div>
    </Card>
  );
}

function VideoThumb({ video, className }: { video: NewsItem; className?: string }) {
  return (
    <div className={cn("relative aspect-video overflow-hidden bg-foreground/[0.06]", className)}>
      <YouTubeImage urls={ytThumbs(video, "mqdefault")} width={320} height={180} />
      <PlayButton />
    </div>
  );
}

/** A Short as a tall card. YouTube's portrait thumbnail is missing for some Shorts; those fall back to the regular one. */
function ShortCard({ video }: { video: NewsItem }) {
  return (
    <Card onClick={open(video)} className={cn("group relative w-[150px] shrink-0 overflow-hidden", HOVER)}>
      <div className="relative aspect-[9/16] overflow-hidden bg-foreground/[0.06]">
        <YouTubeImage urls={ytThumbs(video, "oardefault")} width={150} height={267} />
        <PlayButton />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-3 pt-8 text-white">
        <p className="line-clamp-2 text-xs font-semibold leading-snug">{video.title}</p>
        <p className="mt-0.5 text-[11px] text-white/70">{video.source}</p>
      </div>
    </Card>
  );
}

/* ------------------------------- Pieces ------------------------------- */

function SourceChip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors",
        on
          ? "border-foreground/25 bg-accent text-foreground"
          : "border-foreground/10 bg-foreground/[0.04] text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      {label} <span className="opacity-60">· {count}</span>
    </button>
  );
}

type SourceLogos = Awaited<ReturnType<typeof window.anchor.sourceLogos>>;
/** The showing list's source pictures, and whether they're round (channel avatars) or square (site icons). */
const Logos = createContext<{ urls: Record<string, string>; round: boolean }>({ urls: {}, round: false });

/** The source's own picture (site icon, channel avatar); a coloured initial,
 *  stable across launches, until it's known or if it won't load. */
function SourceMark({ source }: { source: string }) {
  const { urls, round } = useContext(Logos);
  const [broken, setBroken] = useState<string | null>(null);
  const url = urls[source];
  if (url && broken !== url) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(url)}
        className={cn("size-[18px] shrink-0 bg-white object-cover", round ? "rounded-full" : "rounded-[5px]")}
        decoding="async"
        width={18}
        height={18}
      />
    );
  }
  const hue = [...source].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="grid size-[18px] shrink-0 place-items-center rounded-[5px] text-[10px] font-bold text-black/80"
      style={{ background: `hsl(${hue} 65% 62%)` }}
    >
      {source.replace(/^The /, "")[0]}
    </span>
  );
}

function SourceMeta({ item, withTime = true, className }: { item: NewsItem; withTime?: boolean; className?: string }) {
  const when = withTime ? timeAgo(item.published) : "";
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <SourceMark source={item.source} />
      <span className="font-semibold text-foreground/85">{item.source}</span>
      {when && <span>· {when}</span>}
    </p>
  );
}

function DayHeading({ label }: { label: string }) {
  return (
    <h2 className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground after:h-px after:flex-1 after:bg-foreground/10">
      {label}
    </h2>
  );
}

const CardGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">{children}</div>
);

/** An article picture, scaled down to `width` (lib/thumbs) instead of the feed's full-size original. */
function Thumb({ src, className, width, height }: { src: string | null; className?: string; width: number; height: number }) {
  const shown = useThumb(src, width);
  return (
    <div className={cn("overflow-hidden bg-foreground/[0.06]", className)}>
      {shown && (
        <img
          src={shown}
          className="size-full object-cover transition-transform duration-spring ease-spring group-hover:scale-[1.04]"
          loading="lazy"
          decoding="async"
          width={width}
          height={height}
        />
      )}
    </div>
  );
}

/** A video's thumbnails, best first: the size this card wants, then hqdefault, which every processed video has. */
function ytThumbs(video: NewsItem, first: "mqdefault" | "oardefault"): string[] {
  const id = new URL(video.link).searchParams.get("v");
  if (!id) return video.imageUrl ? [video.imageUrl] : [];
  return [`https://i.ytimg.com/vi/${id}/${first}.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`];
}

/** YouTube answers a missing thumbnail with a 404 and a valid 120x90 grey
 *  "no picture" image, so the browser shows it and never fires onError. That
 *  image counts as missing here: the next URL is tried, and with none left the
 *  card keeps its plain tile. Hidden until it's known to be a real thumbnail. */
function YouTubeImage({ urls, width, height }: { urls: string[]; width: number; height: number }) {
  const [at, setAt] = useState(0);
  const [ok, setOk] = useState(false);
  const src = urls[at];
  if (!src) return null;
  const next = () => { setOk(false); setAt((i) => i + 1); };
  return (
    <img
      key={src}
      src={src}
      alt=""
      onLoad={(e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        if (w === 120 && h === 90) next();
        else setOk(true);
      }}
      onError={next}
      className={cn(
        "size-full object-cover transition-[opacity,transform] duration-spring ease-spring group-hover:scale-[1.04]",
        ok ? "opacity-100" : "opacity-0",
      )}
      loading="lazy"
      decoding="async"
      width={width}
      height={height}
    />
  );
}

/** Shows on hover, so a grid of thumbnails isn't a grid of play buttons. */
const PlayButton = () => (
  <div className="absolute inset-0 grid place-items-center">
    <div className="grid size-11 scale-90 place-items-center rounded-full bg-black/60 opacity-0 ring-1 ring-white/25 transition-[opacity,transform] duration-spring ease-spring group-hover:scale-100 group-hover:opacity-100">
      <Play className="size-4 fill-white text-white" />
    </div>
  </div>
);

function LoadingState() {
  return (
    <div className="space-y-7">
      <Skeleton className="h-72" />
      <CardGrid>
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64" />)}
      </CardGrid>
    </div>
  );
}
