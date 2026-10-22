import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardContent, Skeleton, Switch } from "@/components/ui";
import { invalidate, peek, remember } from "@/lib/store";
import { Q } from "@/lib/queries";
import { runTask, useBlockedBy } from "@/lib/tasks";

type Entry = { name: string; command: string; scope: string; enabled: boolean };

export default function StartupPage() {
  const [entries, setEntries] = useState<Entry[] | null>(peek<Entry[]>("startup") ?? null);
  const [loading, setLoading] = useState(false);
  const blocker = useBlockedBy("change");

  async function load(force = false) {
    setLoading(true);
    if (force) invalidate("startup");
    try { setEntries(await Q.startup()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (entries) remember("startup", entries); }, [entries]);

  async function toggle(entry: Entry, on: boolean) {
    const setEnabled = (enabled: boolean) =>
      setEntries((prev) => prev?.map((e) => (e.name === entry.name && e.scope === entry.scope ? { ...e, enabled } : e)) ?? null);
    setEnabled(on);
    const r = await runTask(
      `startup:${entry.scope}:${entry.name}`,
      {
        label: "Startup app",
        where: { section: "startup", tab: "apps" },
        group: "change",
        isError: (x: { ok: boolean; error: string }) => (x.ok ? null : x.error || "Couldn't change this startup app"),
        summarize: () => `${entry.name} ${on ? "enabled" : "disabled"}`,
      },
      async () => {
        const x = await window.anchor.startupToggle(entry.name, entry.scope, on);
        if (!x.ok) invalidate("startup"); // the page may be closed: re-read the truth next visit
        return x;
      },
    );
    if (!r?.ok) setEnabled(!on); // revert on failure (or when it couldn't start)
  }

  return (
    <div className="page-column space-y-6 py-6">

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => load(true)} loading={loading}>
          {!loading && <RefreshCw />} Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {entries === null ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No startup entries found.</p>
        ) : (
          entries.map((e) => (
            <Card key={`${e.scope}:${e.name}`}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <Badge variant="outline">{e.scope}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{e.command}</p>
                  {blocker && <p className="text-xs text-muted-foreground">{blocker.label} is already running</p>}
                </div>
                <Switch checked={e.enabled} disabled={!!blocker} title={blocker ? `${blocker.label} is already running` : undefined} onCheckedChange={(v) => toggle(e, v)} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
