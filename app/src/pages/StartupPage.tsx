import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardContent, Skeleton, Switch } from "@/components/ui";
import { cached, invalidate, peek } from "@/lib/store";

type Entry = { name: string; command: string; scope: string; enabled: boolean };

export default function StartupPage() {
  const [entries, setEntries] = useState<Entry[] | null>(peek<Entry[]>("startup") ?? null);
  const [loading, setLoading] = useState(false);

  async function load(force = false) {
    setLoading(true);
    if (force) invalidate("startup");
    setEntries(await cached("startup", 30_000, () => window.anchor.startupList()));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggle(entry: Entry, on: boolean) {
    setEntries((prev) => prev?.map((e) => (e.name === entry.name && e.scope === entry.scope ? { ...e, enabled: on } : e)) ?? null);
    const r = await window.anchor.startupToggle(entry.name, entry.scope, on);
    if (!r.ok) {
      // revert on failure
      setEntries((prev) => prev?.map((e) => (e.name === entry.name && e.scope === entry.scope ? { ...e, enabled: !on } : e)) ?? null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Startup Apps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apps that launch when Windows boots. Turning one off doesn't uninstall it — it just stops it auto-starting.
          Flip the switch back any time. (Same mechanism as Task Manager's Startup tab.)
        </p>
      </div>

      <Button variant="outline" size="sm" onClick={() => load(true)} loading={loading}>
        {!loading && <RefreshCw />} Refresh
      </Button>

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
                </div>
                <Switch checked={e.enabled} onCheckedChange={(v) => toggle(e, v)} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
