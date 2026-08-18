import { useEffect, useState } from "react";
import { Badge, Button, Card, CardContent, Checkbox, Dialog, Skeleton } from "@/components/ui";

type App = { name: string; packageFullName: string; safe: boolean };

export default function BloatwarePage() {
  const [apps, setApps] = useState<App[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState("");

  async function load() {
    setLoading(true);
    const list = await window.anchor.bloatwareList();
    setApps(list);
    setSelected(new Set());
    setResult(`${list.length} removable apps found (${list.filter((a) => a.safe).length} marked safe).`);
    setLoading(false);
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

  async function remove() {
    setConfirm(false);
    setRemoving(true);
    setResult("Creating restore point…");
    await window.anchor.createRestorePoint("Anchor bloatware removal");
    setResult("Removing…");
    const results = await window.anchor.bloatwareRemove(chosen);
    const ok = results.filter((r) => r.ok).length;
    setResult(
      `Removed ${ok}/${results.length}.` +
        (ok < results.length ? ` Failures: ${results.filter((r) => !r.ok).map((r) => r.name).join(", ")}` : "")
    );
    setRemoving(false);
    load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bloatware Removal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uninstall pre-installed Store apps in batches. Apps marked "Safe" have no system dependencies and can be
          reinstalled free from the Microsoft Store. Essential apps (Store, Calculator, Photos, Security…) are never
          listed. A restore point is created before removal.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={load} loading={loading}>Reload</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelected(new Set(apps?.filter((a) => a.safe).map((a) => a.packageFullName)))}
        >
          Select all safe
        </Button>
        <Button size="sm" onClick={() => setConfirm(true)} disabled={chosen.length === 0} loading={removing}>
          Remove selected ({chosen.length})
        </Button>
      </div>

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
