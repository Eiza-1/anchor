import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import type { NewsItem } from "@/types";

export default function UpdatesPage() {
  const [build, setBuild] = useState("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [last, setLast] = useState("");
  const [news, setNews] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    window.anchor.buildInfo().then((b) => {
      if (b) setBuild(`${b.ProductName} ${b.DisplayVersion} — build ${b.CurrentBuild}.${b.UBR}`);
    });
    window.anchor.windowsNews().then((n) => setNews(n.slice(0, 12)));
  }, []);

  async function check() {
    setChecking(true);
    const u = await window.anchor.checkUpdates();
    if (u.error) setStatus(`Couldn't query Windows Update: ${u.error}. Open Settings > Windows Update to check manually.`);
    else if (u.pending === 0) setStatus("You're on a recent stable build — no cumulative, security, or feature updates are pending.");
    else setStatus(`${u.pending} update(s) pending. Installing cumulative and security updates keeps your system stable and secure.`);
    setPending(u.titles ?? []);
    setLast(u.last ? `Last successful update: ${u.last}` : "");
    setChecking(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <h1 className="text-3xl font-semibold tracking-tight">Windows Update</h1>

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
                  className="flex w-full gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
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
