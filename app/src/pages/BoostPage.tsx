import { useEffect, useState } from "react";
import { AlertTriangle, Eraser, RefreshCw, Trash2, Zap } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Checkbox, Dialog, Label, Skeleton,
} from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import { cached, invalidate, peek, runBoost, useAppState } from "@/lib/store";

type Target = {
  id: string; name: string; detail: string;
  default: boolean; oneWay: boolean; bytes: number;
};

export default function BoostPage() {
  const { boost } = useAppState();
  const [targets, setTargets] = useState<Target[] | null>(peek<Target[]>("cleanup:scan") ?? null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => { scan(); }, []);

  async function scan(force = false) {
    setScanning(true);
    if (force) invalidate("cleanup:scan");
    const list = await cached("cleanup:scan", 60_000, () => window.anchor.cleanupScan());
    setTargets(list);
    setChosen(new Set(list.filter((t) => t.default && t.bytes > 0).map((t) => t.id)));
    setScanning(false);
  }

  const selected = (targets ?? []).filter((t) => chosen.has(t.id));
  const totalSelected = selected.reduce((sum, t) => sum + t.bytes, 0);
  const totalFound = (targets ?? []).reduce((sum, t) => sum + t.bytes, 0);
  const hasOneWay = selected.some((t) => t.oneWay);

  async function clean() {
    setConfirm(false);
    setCleaning(true);
    setResult("Clearing…");
    const r = await window.anchor.cleanupRun([...chosen]);
    setResult(`Freed ${formatBytes(r.freed)} from ${r.cleaned.length} location${r.cleaned.length === 1 ? "" : "s"}.`);
    setCleaning(false);
    scan(true);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <h1 className="text-3xl font-semibold tracking-tight">Boost & Cleanup</h1>

      {/* memory */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4 text-sky-500" /> Free up memory
          </CardTitle>
          <CardDescription>
            Trims the memory working set of background processes. Anything with an open window — everything on your
            taskbar — and critical system processes are always skipped. Trimming never closes a program; Windows simply
            reloads pages if the app needs them again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => runBoost({ includeTemp: false, includeRecycleBin: false })}
            loading={boost.running}
          >
            {!boost.running && <Zap />} Free memory now
          </Button>
          {boost.message && <p className="text-sm text-muted-foreground">{boost.message}</p>}
          {boost.skipped.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">
                Transparency log — {boost.skipped.length} processes deliberately left alone
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {boost.skipped.map((s) => (
                  <span key={s} className="rounded-md bg-secondary px-2 py-0.5">{s}</span>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* disk cleanup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eraser className="size-4 text-sky-500" /> Free up disk space
          </CardTitle>
          <CardDescription>
            Each location is measured before anything is deleted, so you decide with real numbers. Personal files —
            documents, downloads, pictures, saved passwords — are never touched.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => scan(true)} loading={scanning}>
              {!scanning && <RefreshCw />} Rescan
            </Button>
            <Button
              onClick={() => setConfirm(true)}
              disabled={chosen.size === 0 || cleaning}
              loading={cleaning}
            >
              {!cleaning && <Trash2 />} Clear selected ({formatBytes(totalSelected)})
            </Button>
            {targets && (
              <span className="text-xs text-muted-foreground">
                {formatBytes(totalFound)} reclaimable in total
              </span>
            )}
          </div>

          {result && <p className="text-sm text-muted-foreground">{result}</p>}

          <div className="space-y-1.5">
            {targets === null
              ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              : targets.map((t) => {
                  const empty = t.bytes === 0;
                  return (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 ${empty ? "opacity-50" : ""}`}
                    >
                      <Checkbox
                        checked={chosen.has(t.id)}
                        onCheckedChange={(v) =>
                          setChosen((prev) => {
                            const next = new Set(prev);
                            v ? next.add(t.id) : next.delete(t.id);
                            return next;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {t.name}
                          <span className="text-xs font-normal text-muted-foreground">
                            {empty ? "nothing to clear" : formatBytes(t.bytes)}
                          </span>
                          {t.oneWay && <Badge variant="warning">Can't be undone</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.detail}</p>
                      </div>
                    </label>
                  );
                })}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Clear ${formatBytes(totalSelected)}?`}
        description="These files will be permanently deleted. Windows and your apps rebuild anything they still need."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button onClick={clean}>Clear them</Button>
          </>
        }
      >
        <ul className="space-y-1 text-muted-foreground">
          {selected.map((t) => (
            <li key={t.id}>• {t.name} — {formatBytes(t.bytes)}</li>
          ))}
        </ul>
        {hasOneWay && (
          <Alert variant="warning" className="mt-3">
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Your selection includes the previous Windows installation. Removing it frees a lot of space but means
                you can no longer roll back to the earlier Windows version.
              </span>
            </span>
          </Alert>
        )}
      </Dialog>
    </div>
  );
}
