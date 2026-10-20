import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Eraser, RefreshCw, Trash2, Zap } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Checkbox, Dialog, Label, Skeleton,
} from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import { invalidate, peek, runMemoryTrim, useAppState } from "@/lib/store";
import { Q } from "@/lib/queries";
import { runTask, useBlockedBy, useTask } from "@/lib/tasks";

type Target = {
  id: string; name: string; detail: string;
  default: boolean; oneWay: boolean; bytes: number;
};

export default function BoostPage() {
  const { trim } = useAppState();
  const [targets, setTargets] = useState<Target[] | null>(peek<Target[]>("cleanup:scan") ?? null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const scanTask = useTask<Target[]>("cleanup:scan");
  const cleanTask = useTask<{ freed: number; cleaned: string[] }>("cleanup:clean");
  const blocker = useBlockedBy("cleanup");
  const scanning = scanTask?.status === "running";
  const cleaning = cleanTask?.status === "running";
  const blockedMsg = blocker && blocker.key !== "cleanup:clean" ? `${blocker.label} is already running` : undefined;
  const hadList = useRef(targets !== null);
  const forceNext = useRef(false);

  useEffect(() => {
    // pre-select from saved results right away; the rescan below refreshes them
    if (targets) setChosen(new Set(targets.filter((t) => t.default && t.bytes > 0).map((t) => t.id)));
    scan(false, true);
  }, []);

  // a finished scan (even one that finished while this page was closed) shows its list;
  // a background refresh keeps whatever the user ticked meanwhile
  useEffect(() => {
    if (scanTask?.status !== "done" || !scanTask.result) return;
    const list = scanTask.result;
    setTargets(list);
    if (forceNext.current || !hadList.current) {
      setChosen(new Set(list.filter((t) => t.default && t.bytes > 0).map((t) => t.id)));
    }
    forceNext.current = false;
    hadList.current = true;
  }, [scanTask?.finishedAt]);

  // after a clean finishes, the numbers are stale
  const firstClean = useRef(true);
  useEffect(() => {
    if (firstClean.current) { firstClean.current = false; return; }
    if (cleanTask?.status === "done") scan(true);
  }, [cleanTask?.finishedAt]);

  function scan(force = false, automatic = false) {
    if (force) { invalidate("cleanup:scan"); forceNext.current = true; }
    return runTask(
      "cleanup:scan",
      { label: "Cleanup scan", where: { section: "cleanup" }, silent: automatic },
      () => Q.cleanupScan(),
    );
  }

  const selected = (targets ?? []).filter((t) => chosen.has(t.id));
  const totalSelected = selected.reduce((sum, t) => sum + t.bytes, 0);
  const totalFound = (targets ?? []).reduce((sum, t) => sum + t.bytes, 0);
  const hasOneWay = selected.some((t) => t.oneWay);

  function clean() {
    setConfirm(false);
    runTask(
      "cleanup:clean",
      {
        label: "Cleanup",
        where: { section: "cleanup" },
        group: "cleanup",
        summarize: (r) => `Freed ${formatBytes(r.freed)}`,
      },
      () => window.anchor.cleanupRun([...chosen]),
    );
  }

  const result = cleaning
    ? "Clearing…"
    : cleanTask?.status === "done" && cleanTask.result
    ? `Freed ${formatBytes(cleanTask.result.freed)} from ${cleanTask.result.cleaned.length} location${cleanTask.result.cleaned.length === 1 ? "" : "s"}.`
    : cleanTask?.status === "error"
    ? `Cleanup failed: ${cleanTask.error}`
    : "";

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Cleanup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything is measured first, so you decide with real numbers. Personal files are never touched.
        </p>
      </div>

      {/* disk cleanup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eraser className="size-4 text-sky-500" /> Free up disk space
          </CardTitle>
          <CardDescription>
            Documents, downloads, pictures and saved passwords are never touched. Locations ticked by default are what
            one-click Boost on Home clears.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => scan(true)} loading={scanning}>
              {!scanning && <RefreshCw />} Rescan
            </Button>
            <Button
              onClick={() => setConfirm(true)}
              disabled={chosen.size === 0 || !!blockedMsg}
              title={blockedMsg}
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

          {blockedMsg && <p className="text-xs text-muted-foreground">{blockedMsg}</p>}
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

      {/* memory — optional, deliberately not part of Boost */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4 text-sky-500" /> Trim background memory
          </CardTitle>
          <CardDescription>
            Usually not needed — Windows manages memory well on its own, and trimmed apps reload what they need, so
            they can be briefly slower afterwards. Useful right before launching something memory-hungry. Apps with an
            open window and system processes are always skipped; nothing is closed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={runMemoryTrim} loading={trim.running}>
            {!trim.running && <Zap />} Trim now
          </Button>
          {trim.message && <p className="text-sm text-muted-foreground">{trim.message}</p>}
          {trim.skipped.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">
                {trim.skipped.length} processes deliberately left alone
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trim.skipped.map((x) => (
                  <span key={x} className="rounded-md bg-secondary px-2 py-0.5">{x}</span>
                ))}
              </div>
            </details>
          )}
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
