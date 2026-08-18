import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Button, Card, CardContent, Select, Skeleton, Tabs } from "@/components/ui";
import { cached, invalidate, peek } from "@/lib/store";
import type { NewsItem } from "@/types";

const NEWS_TTL = 10 * 60 * 1000; // feeds don't change minute to minute

export default function SpotlightPage() {
  const [mode, setMode] = useState<"articles" | "videos">("articles");
  // seed from cache so returning to this page paints instantly
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
    const [a, v] = await Promise.all([
      cached("news:articles", NEWS_TTL, async () => {
        const list = await window.anchor.articles();
        // Backfill missing thumbnails once, then cache the enriched list.
        const missing = list.filter((x) => !x.imageUrl).map((x) => x.link);
        if (missing.length) {
          const found = await window.anchor.backfillImages(missing);
          return list.map((x) => (x.imageUrl || !found[x.link] ? x : { ...x, imageUrl: found[x.link] }));
        }
        return list;
      }),
      cached("news:videos", NEWS_TTL, () => window.anchor.videos()),
    ]);
    setArticles(a);
    setVideos(v);
    setLoading(false);
  }, []);

  useEffect(() => {
    cached("news:feeds", Infinity, () => window.anchor.feeds()).then(setSources);
    load();
  }, [load]);

  useEffect(() => setFilter("All sources"), [mode]);

  const list = mode === "videos" ? videos : articles;
  const filtered = list?.filter((i) => filter === "All sources" || i.source === filter) ?? null;
  const options = mode === "videos" ? sources.videos : sources.articles;

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Tech Spotlight</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
              className="card-item cursor-pointer overflow-hidden transition-colors hover:bg-accent"
            >
              <div className="relative aspect-video bg-secondary">
                {v.imageUrl && (
                  <img
                    src={v.imageUrl}
                    className="size-full object-cover"
                    loading="lazy"
                    decoding="async"
                    width={320}
                    height={180}
                  />
                )}
                <div className="absolute inset-0 grid place-items-center">
                  <div className="grid size-11 place-items-center rounded-full bg-black/70 backdrop-blur">
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
              className="list-item flex w-full gap-4 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
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
