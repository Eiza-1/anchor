import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageTitle, Skeleton } from "@/components/ui";
import type { NewsItem } from "@/types";
import { peek } from "@/lib/store";
import { articles, Q, windowsNews } from "@/lib/queries";
import { runTask, useTask } from "@/lib/tasks";

type UpdateResult = Awaited<ReturnType<typeof window.anchor.checkUpdates>>;

const describe = (b: Awaited<ReturnType<typeof Q.buildInfo>>) =>
  b ? `${b.ProductName} ${b.DisplayVersion} — build ${b.CurrentBuild}.${b.UBR}` : "";

export default function UpdatesPage() {
  const [build, setBuild] = useState(describe(peek("build") ?? null));
  const task = useTask<UpdateResult>("updates:check");
  const checking = task?.status === "running";
  const u = task?.result;
  const status = task?.status === "error"
    ? `Couldn't query Windows Update: ${task.error}. Open Settings > Windows Update to check manually.`
    : !u ? ""
    : u.error ? `Couldn't query Windows Update: ${u.error}. Open Settings > Windows Update to check manually.`
    : u.pending === 0 ? "You're on a recent stable build — no cumulative, security, or feature updates are pending."
    : `${u.pending} update(s) pending. Installing cumulative and security updates keeps your system stable and secure.`;
  const pending = u?.titles ?? [];
  const last = u?.last ? `Last successful update: ${u.last}` : "";
  const cachedNews = peek<NewsItem[]>("news:articles");
  const [news, setNews] = useState<NewsItem[] | null>(cachedNews ? windowsNews(cachedNews).slice(0, 12) : null);

  useEffect(() => {
    Q.buildInfo().then((b) => setBuild(describe(b)), () => {});
    window.anchor.prefetchUpdates().catch(() => {}); // a no-op when launch already did it
    articles().then((list) => setNews(windowsNews(list).slice(0, 12)), () => setNews([]));
  }, []);

  function check() {
    runTask(
      "updates:check",
      {
        label: "Windows Update check",
        where: { section: "updates" },
        isError: (r: UpdateResult) => r.error ?? null,
        summarize: (r) => (r.pending === 0 ? "Up to date" : `${r.pending} update${r.pending === 1 ? "" : "s"} pending`),
      },
      () => window.anchor.checkUpdates(),
    );
  }

  return (
    <div className="page-column space-y-6 py-6">
      <div>
        <PageTitle>Windows Update</PageTitle>
        <p className="mt-1 text-sm text-foreground/80 dark:[text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
          Check for pending updates and read recent update news.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Am I on a recent stable build?</CardTitle>
          <CardDescription>{build || "Reading build information…"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={check} loading={checking}>Check for updates</Button>
            <Button variant="outline" onClick={() => window.anchor.openTool("ms-settings:windowsupdate")}>
              Open Windows Update settings
            </Button>
          </div>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
          {pending.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {pending.map((t) => <li key={t}>• {t}</li>)}
            </ul>
          )}
          {last && <p className="text-xs text-muted-foreground">{last}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent — Windows update news</CardTitle>
          <CardDescription>
            Article previews about cumulative, security, and feature updates from WindowsLatest, the Windows Blog, and
            Windows Central. Click to open in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {news === null
            ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            : news.map((n) => (
                <button
                  key={n.link}
                  onClick={() => window.anchor.openExternal(n.link)}
                  className="glass cut-corner flex w-full gap-3 rounded-lg p-3 text-left transition-[transform,background-color] duration-spring ease-spring hover:-translate-y-px hover:bg-accent/70"
                >
                  {n.imageUrl && (
                    <img src={n.imageUrl} className="h-16 w-24 shrink-0 rounded-md object-cover" loading="lazy" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {n.title} <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{n.summary}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{n.source}</p>
                  </div>
                </button>
              ))}
        </CardContent>
      </Card>
    </div>
  );
}
