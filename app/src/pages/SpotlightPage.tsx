import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Button, Card, CardContent, PageTitle, Select, Skeleton, Tabs } from "@/components/ui";
import { invalidate, peek } from "@/lib/store";
import { articles as loadArticles, Q } from "@/lib/queries";
import type { NewsItem } from "@/types";

export default function SpotlightPage() {
  const [mode, setMode] = useState<"articles" | "videos">("articles");
  // seed from cache so the page paints instantly, even on a fresh launch
  const [articles, setArticles] = useState<NewsItem[] | null>(peek<NewsItem[]>("news:articles") ?? null);
  const [videos, setVideos] = useState<NewsItem[] | null>(peek<NewsItem[]>("news:videos") ?? null);
  const [sources, setSources] = useState<{ articles: string[]; videos: string[] }>(
    peek("news:feeds") ?? { articles: [], videos: [] }
  );
  const [filter, setFilter] = useState("All sources");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    if (force) invalidate("news:articles", "news:videos");
    // With nothing on screen yet, show each feed as it lands; otherwise swap in
    // the fresh list once it's complete so the page doesn't reshuffle mid-read.
    const showPartial = peek("news:articles") === undefined;
    await Promise.all([
      loadArticles(showPartial ? setArticles : undefined).then(setArticles, () => {}),
      Q.videos().then(setVideos, () => {}),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    Q.feeds().then(setSources, () => {});
    load();
  }, [load]);

  useEffect(() => setFilter("All sources"), [mode]);

  const list = mode === "videos" ? videos : articles;
  const filtered = list?.filter((i) => filter === "All sources" || i.source === filter) ?? null;
  const options = mode === "videos" ? sources.videos : sources.articles;

  return (
    <div className="space-y-6 py-6">
      <div>
        <PageTitle>Tech Spotlight</PageTitle>
        <p className="mt-1 text-sm text-foreground/80 dark:[text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
          Latest tech news and videos via public feeds — no accounts, no tracking. Click anything to open it in your browser.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as "articles" | "videos")}
          options={[
            { value: "articles", label: "Articles" },
            { value: "videos", label: "Videos" },
          ]}
        />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-56">
          <option>All sources</option>
          {options.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Button variant="outline" size="sm" onClick={() => load(true)} loading={loading}>
          {!loading && <RefreshCw />} Refresh
        </Button>
      </div>

      {filtered === null ? (
        <div className={mode === "videos" ? "grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4" : "space-y-2"}>
          {[...Array(6)].map((_, i) => <Skeleton key={i} className={mode === "videos" ? "h-64" : "h-24"} />)}
        </div>
      ) : mode === "videos" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {filtered.slice(0, 48).map((v) => (
            <Card
              key={v.link}
              onClick={() => window.anchor.openExternal(v.link)}
              className="offscreen-card group cursor-pointer overflow-hidden transition-[transform,background-color] duration-spring ease-spring hover:-translate-y-0.5 hover:bg-accent/70"
            >
              <div className="relative aspect-video overflow-hidden bg-foreground/[0.06]">
                {v.imageUrl && (
                  <img
                    src={v.imageUrl}
                    className="size-full object-cover transition-transform duration-spring ease-spring group-hover:scale-[1.03]"
                    loading="lazy"
                    decoding="async"
                    width={320}
                    height={180}
                  />
                )}
                <div className="absolute inset-0 grid place-items-center">
                  <div className="grid size-11 place-items-center rounded-full bg-black/60 ring-1 ring-white/25 transition-transform duration-spring ease-spring group-hover:scale-110">
                    <Play className="size-4 fill-white text-white" />
                  </div>
                </div>
              </div>
              <CardContent className="space-y-1 p-3">
                <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
                <p className="text-xs text-muted-foreground">
                  {v.source} · {new Date(v.published).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="max-w-4xl space-y-2">
          {filtered.slice(0, 60).map((a) => (
            <button
              key={a.link}
              onClick={() => window.anchor.openExternal(a.link)}
              className="offscreen-row glass cut-corner flex w-full gap-4 rounded-lg p-3 text-left transition-[transform,background-color] duration-spring ease-spring hover:-translate-y-px hover:bg-accent/70"
            >
              {a.imageUrl && (
                <img
                  src={a.imageUrl}
                  className="h-[84px] w-[132px] shrink-0 rounded-md object-cover"
                  loading="lazy"
                  decoding="async"
                  width={132}
                  height={84}
                />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="line-clamp-2 text-sm font-medium">{a.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{a.summary}</p>
                <p className="text-xs font-medium text-muted-foreground">
                  {a.source}
                  {a.published ? ` · ${new Date(a.published).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
