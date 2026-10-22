import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Clock, Cpu, Droplets, FileWarning, Play, RefreshCw, Stethoscope, Wrench,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Dialog, Skeleton,
} from "@/components/ui";
import { cn, formatBytes } from "@/lib/utils";
import { cpuHogs, findLeaks, uptimeAdvice, type ProcSample, type SystemState } from "@/lib/diagnose";
import {
  clearLeakHistory, ensureRestorePoint, invalidate, peek, startLeakWatch, useProcHistory,
} from "@/lib/store";
import { Q } from "@/lib/queries";
import { runTask, useBlockedBy, useRunningKeyWith, useTask } from "@/lib/tasks";

type Repair = { id: string; name: string; detail: string; minutes: string };
type ErrorGroups = { total: number; groups: { source: string; count: number; latest: string; sample: string }[] };

export default function DiagnosticsPage() {
  const history = useProcHistory();
  const [state, setState] = useState<SystemState | null>(peek<SystemState>("diag:state") ?? null);
  const [errors, setErrors] = useState<ErrorGroups | null>(peek<ErrorGroups>("diag:errors") ?? null);
  const [repairs, setRepairs] = useState<Repair[]>(peek<Repair[]>("diag:repairs") ?? []);
  const [confirm, setConfirm] = useState<Repair | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    startLeakWatch();               // keeps sampling even after leaving this page
    load();
    Q.diagRepairs().then(setRepairs, () => {});
  }, []);

  async function load(force = false) {
    setRefreshing(true);
    if (force) invalidate("diag:state", "diag:errors");
    await Promise.allSettled([Q.diagState().then(setState), Q.diagErrors().then(setErrors)]);
    setRefreshing(false);
  }

  const { suspects, minutesObserved } = findLeaks(history);
  const latest: ProcSample[] = history[history.length - 1]?.procs ?? [];
  const hogs = cpuHogs(latest);
  const advice = uptimeAdvice(state, suspects.filter((s) => s.confidence !== "watching").length);

  function runRepair(r: Repair) {
    setConfirm(null);
    runTask(
      `diag:repair:${r.id}`,
      {
        label: r.name,
        where: { section: "system", tab: "diagnostics" },
        group: "change",
        isError: (res: { ok: boolean; output: string; error: string }) =>
          res.ok ? null : `${r.name} reported a problem: ${res.error || res.output.slice(-200)}`,
        summarize: () => `${r.name} finished.`,
      },
      async () => {
        if (r.id === "winsock" || r.id === "updatecache") await ensureRestorePoint(`Anchor: ${r.name}`);
        const res = await window.anchor.diagRunRepair(r.id);
        invalidate("diag:state", "diag:errors"); // stale now, even if this page is closed
        return res;
      },
    );
  }

  // a finished repair refreshes the system state while this page is open (if closed, the invalidate in the task covers the next visit)
  const anyRepair = useRunningKeyWith("diag:repair:");
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !anyRepair) load(true);
    wasRunning.current = !!anyRepair;
  }, [anyRepair]);

  const TONE = {
    // a status tint over the glass (the tint replaces the glass fill; the glass edge stays)
    ok: "bg-emerald-500/10",
    suggest: "bg-amber-500/10",
    urgent: "bg-red-500/10",
  } as const;

  return (
    <div className="page-column space-y-6 py-6">

      {/* uptime verdict */}
      <div className={cn("glass cut-corner rounded-lg p-4", TONE[advice.level])}>
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{advice.headline}</p>
            <p className="mt-1 text-sm text-muted-foreground">{advice.detail}</p>
          </div>
        </div>
      </div>

      {/* system state */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="size-4 text-primary" /> System state
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => load(true)} loading={refreshing}>
            {!refreshing && <RefreshCw />} Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {!state ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Uptime" value={state.uptimeHours < 24
                ? `${Math.round(state.uptimeHours)} h`
                : `${Math.floor(state.uptimeHours / 24)} d`} />
              <Stat label="Memory in use"
                value={`${Math.round(((state.totalMemory - state.freeMemory) / state.totalMemory) * 100)}%`} />
              <Stat label="Committed" value={`${state.commitPercent}%`} />
              <Stat label="Non-paged pool" value={formatBytes(state.nonPagedPool)}
                warn={state.nonPagedPool > 600 * 1024 ** 2} />
              <Stat label="Open handles" value={state.handleCount.toLocaleString()}
                warn={state.handleCount > 400_000} />
              <Stat label="Processes" value={String(state.processCount)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* memory leaks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="size-4 text-primary" /> Memory leak watch
          </CardTitle>
          <CardDescription>
            A big app isn't a leak — a leak is memory that climbs and never comes back. Anchor samples every minute and
            looks at the trend, so leave it running a while. {minutesObserved} minutes observed so far.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length < 3 ? (
            <p className="text-sm text-muted-foreground">
              Collecting baseline samples… come back in a few minutes.
            </p>
          ) : suspects.length === 0 ? (
            <Alert variant="success">
              No leaks detected. Every process is holding memory steady or releasing it normally.
            </Alert>
          ) : (
            suspects.map((s) => (
              <div key={s.pid} className="glass cut-corner rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.confidence === "strong" ? "destructive" : s.confidence === "likely" ? "warning" : "secondary"}>
                    {s.confidence === "watching" ? "Still watching" : s.confidence === "likely" ? "Likely leak" : "Strong leak"}
                  </Badge>
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    now {formatBytes(s.current)} · +{formatBytes(s.growthPerHour)}/h
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{s.detail}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => window.anchor.diagTrim(s.pid)}>
                    Trim its memory now
                  </Button>
                </div>
              </div>
            ))
          )}
          {history.length >= 3 && (
            <Button size="sm" variant="ghost" onClick={clearLeakHistory}>Reset observations</Button>
          )}
        </CardContent>
      </Card>

      {/* cpu hogs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" /> CPU time hogs
          </CardTitle>
          <CardDescription>
            Total CPU each process has consumed since it started. Something using a steady slice while "idle" shows up
            here even when live usage looks fine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {hogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing is burning unusual CPU time in the background.
            </p>
          ) : (
            hogs.map((p) => (
              <div key={p.pid} className="flex flex-wrap items-center justify-between gap-2 glass cut-corner rounded-lg p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.totalHours} h of CPU time over {p.ageHours.toFixed(1)} h running — averaging {p.corePercent}% of a core
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => window.anchor.diagTrim(p.pid)}>Trim memory</Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* error build-up */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="size-4 text-primary" /> Errors in the last 7 days
          </CardTitle>
          <CardDescription>
            Critical and error entries from the System and Application logs, grouped by what caused them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!errors ? (
            <Skeleton className="h-20 w-full" />
          ) : errors.total === 0 ? (
            <Alert variant="success">No errors logged in the last week.</Alert>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{errors.total} entries logged.</p>
              {errors.groups.map((g) => (
                <div key={g.source} className="glass cut-corner rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={g.count > 50 ? "warning" : "secondary"}>{g.count}×</Badge>
                    <span className="text-sm font-medium">{g.source}</span>
                    <span className="text-xs text-muted-foreground">last {g.latest?.slice(0, 16)}</span>
                  </div>
                  {g.sample && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.sample}</p>}
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* repairs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-4 text-primary" /> Repairs
          </CardTitle>
          <CardDescription>
            Each one is a documented Windows repair. Anchor explains what it does before running it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {repairs.map((r) => (
            <RepairRow key={r.id} r={r} anyRunning={anyRepair} onAsk={() => setConfirm(r)} />
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={`Run "${confirm?.name}"?`}
        description={confirm?.detail}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => confirm && runRepair(confirm)}>Run it</Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
          <span>
            Takes {confirm?.minutes}. Explorer-based repairs will briefly close your taskbar and windows list — open
            apps are not affected.
          </span>
        </p>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="glass cut-corner rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", warn && "text-amber-400")}>{value}</p>
    </div>
  );
}

function RepairRow({ r, anyRunning, onAsk }: { r: Repair; anyRunning?: string; onAsk: () => void }) {
  const task = useTask<{ ok: boolean; output: string; error: string }>(`diag:repair:${r.id}`);
  const blocker = useBlockedBy("change");
  const running = task?.status === "running";
  const blockedMsg = blocker ? `${blocker.label} is already running` : anyRunning && !running ? "Another repair is already running" : undefined;
  const msg = running
    ? `Running ${r.name}… ${r.minutes === "instant" ? "" : `This takes ${r.minutes}.`}`
    : task?.status === "done"
    ? `${r.name} finished.`
    : task?.status === "error"
    ? task.error ?? ""
    : "";
  return (
    <div className="glass cut-corner rounded-lg p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {r.name}
            <Badge variant="secondary">{r.minutes}</Badge>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{r.detail}</p>
        </div>
        <Button size="sm" variant="outline" loading={running} disabled={!!blockedMsg || !!anyRunning} title={blockedMsg} onClick={onAsk}>
          {!running && <Play />} Run
        </Button>
      </div>
      {blockedMsg && !running && <p className="mt-2 text-xs text-muted-foreground">{blockedMsg}</p>}
      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
