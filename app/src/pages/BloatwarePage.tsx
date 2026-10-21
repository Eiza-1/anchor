import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardContent, Checkbox, Dialog, Skeleton } from "@/components/ui";
import { ensureRestorePoint, invalidate, peek } from "@/lib/store";
import { Q } from "@/lib/queries";
import { runTask, useBlockedBy, useTask } from "@/lib/tasks";
import { countSummary } from "@/lib/utils";

type RemoveResult = Array<{ name: string; ok: boolean; error: string }>;

type App = { name: string; packageFullName: string; safe: boolean };

export default function BloatwarePage() {
  const [apps, setApps] = useState<App[] | null>(peek<App[]>("bloatware") ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const removeTask = useTask<RemoveResult>("bloat:remove");
  const blocker = useBlockedBy("change");
  const removing = removeTask?.status === "running";
  const blockedMsg = blocker && blocker.key !== "bloat:remove" ? `${blocker.label} is already running` : undefined;
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState("");

  async function load(force = false) {
    setLoading(true);
    if (force) invalidate("bloatware");
    try {
      const list = await Q.bloatware();
      setApps(list);
      setSelected((prev) => new Set([...prev].filter((p) => list.some((a) => a.packageFullName === p))));
      setResult(`${list.length} removable apps found (${list.filter((a) => a.safe).length} marked safe).`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function toggle(pkg: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      on ? next.add(pkg) : next.delete(pkg);
      return next;
    });
  }

  const chosen = apps?.filter((a) => selected.has(a.packageFullName)) ?? [];

  function remove() {
    setConfirm(false);
    const pkgs = chosen;
    runTask(
      "bloat:remove",
      {
        label: "Bloatware removal",
        where: { section: "debloat", tab: "bloatware" },
        group: "change",
        isError: (r: RemoveResult) =>
          r.length > 0 && r.every((x) => !x.ok) ? `Couldn't remove: ${r.map((x) => x.name).join(", ")}` : null,
        summarize: (r) => countSummary("Removed", r.filter((x) => x.ok).length, r.length, "app"),
      },
      async () => {
        await ensureRestorePoint("Anchor bloatware removal");
        const r = await window.anchor.bloatwareRemove(pkgs);
        invalidate("bloatware"); // stale now, even if this page is closed: the next visit refetches
        return r;
      },
    );
  }

  // a finished removal refreshes the list while this page is open (if it was closed, the invalidate above covers the next visit)
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (removeTask && removeTask.status !== "running") {
      setSelected(new Set());
      load(true);
    }
  }, [removeTask?.finishedAt]);

  const removeLine = removing
    ? "Creating a restore point if needed, then removing…"
    : removeTask?.status === "error" && !removeTask.result
    ? `Removal failed: ${removeTask.error}`
    : removeTask?.result
    ? `Removed ${removeTask.result.filter((r) => r.ok).length}/${removeTask.result.length}.` +
      (removeTask.result.some((r) => !r.ok) ? ` Failures: ${removeTask.result.filter((r) => !r.ok).map((r) => r.name).join(", ")}` : "")
    : "";

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => load(true)} loading={loading}>Reload</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelected(new Set(apps?.filter((a) => a.safe).map((a) => a.packageFullName)))}
        >
          Select all safe
        </Button>
        <Button size="sm" onClick={() => setConfirm(true)} disabled={chosen.length === 0 || !!blockedMsg} title={blockedMsg} loading={removing}>
          Remove selected ({chosen.length})
        </Button>
      </div>

      {blockedMsg && <p className="text-xs text-muted-foreground">{blockedMsg}</p>}
      {removeLine && <p className="text-sm text-muted-foreground">{removeLine}</p>}
      {result && <p className="text-sm text-muted-foreground">{result}</p>}

      <div className="space-y-1.5">
        {apps === null
          ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
          : apps.map((a) => (
              <Card key={a.packageFullName}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Checkbox
                    checked={selected.has(a.packageFullName)}
                    onCheckedChange={(v) => toggle(a.packageFullName, v)}
                  />
                  <span className="flex-1 truncate text-sm">{a.name}</span>
                  {a.safe && <Badge variant="success">Safe to remove</Badge>}
                </CardContent>
              </Card>
            ))}
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Remove ${chosen.length} app(s)?`}
        description="A System Restore point will be created first. Removed apps can be reinstalled from the Microsoft Store."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button onClick={remove}>Create restore point & remove</Button>
          </>
        }
      >
        <ul className="space-y-1 text-muted-foreground">
          {chosen.map((a) => <li key={a.packageFullName}>• {a.name}</li>)}
        </ul>
      </Dialog>
    </div>
  );
}
