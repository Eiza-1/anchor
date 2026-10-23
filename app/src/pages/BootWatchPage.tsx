import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Clock, Eye, FileWarning, RefreshCw, ShieldAlert, ShieldCheck, Terminal,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Dialog, Skeleton, Switch,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { ensureRestorePoint, invalidate, peek } from "@/lib/store";
import { Q } from "@/lib/queries";
import { runTask, useBlockedBy, useTask } from "@/lib/tasks";
import type { BootFinding, BootProcessEvent } from "@/types";

const LEVEL_BADGE = { high: "destructive", medium: "warning", low: "secondary" } as const;
const LEVEL_LABEL = { high: "Suspicious", medium: "Worth checking", low: "Looks normal" };

export default function BootWatchPage() {
  const [enabled, setEnabled] = useState(false);
  const [findings, setFindings] = useState<BootFinding[] | null>(peek<BootFinding[]>("boot:scan") ?? null);
  const [events, setEvents] = useState<BootProcessEvent[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirm, setConfirm] = useState<BootFinding | null>(null);

  useEffect(() => {
    window.anchor.bootStatus().then((s) => setEnabled(s.enabled));
    scan();
    return window.anchor.onBootProcess((ev) => setEvents((prev) => [ev, ...prev].slice(0, 50)));
  }, []);

  async function scan(force = false) {
    setScanning(true);
    if (force) invalidate("boot:scan");
    try { setFindings(await Q.bootScan()); } finally { setScanning(false); }
  }

  function disable(f: BootFinding) {
    setConfirm(null);
    runTask(
      `boot:disable:${f.id}`,
      {
        label: "Boot Watch",
        where: { section: "startup", tab: "bootwatch" },
        group: "change",
        isError: (r: { ok: boolean; error: string }) => (r.ok ? null : r.error || "Couldn't disable it"),
        summarize: () => `${f.name} disabled`,
      },
      async () => {
        await ensureRestorePoint("Anchor disabled a startup item");
        const r = await window.anchor.bootDisable(f.id);
        invalidate("boot:scan"); // stale now, even if this page is closed
        return r;
      },
    );
  }

  const suspicious = (findings ?? []).filter((f) => f.level !== "low");
  const shown = showAll ? findings ?? [] : suspicious;

  return (
    <div className="page-column space-y-6 py-6">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="size-4 text-primary" /> Watch every startup
          </CardTitle>
          <CardDescription>
            Anchor starts with Windows in the background, records what runs, and notifies you if something suspicious
            appears. It sits in the system tray and uses almost nothing while idle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm">Start Anchor with Windows and watch startup activity</p>
            <Switch
              checked={enabled}
              onCheckedChange={async (v) => {
                setEnabled(v);
                await window.anchor.bootSetEnabled(v);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* live catches */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-4 text-amber-400" /> Caught running
            </CardTitle>
            <CardDescription>
              Scripts and console commands that started while Anchor was watching — including the ones that flash and
              vanish.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.map((e, i) => (
              <div key={`${e.pid}-${e.time}-${i}`} className="glass cut-corner rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={LEVEL_BADGE[e.level]}>{LEVEL_LABEL[e.level]}</Badge>
                  <span className="text-sm font-medium">{e.name}</span>
                  <span className="text-xs text-muted-foreground">
                    started by {e.parent || "unknown"} · {new Date(e.time * 1000).toLocaleTimeString()}
                  </span>
                </div>
                {e.command && (
                  <p className="mt-1.5 break-all rounded bg-foreground/[0.07] p-2 font-mono text-xs text-muted-foreground">
                    {e.command}
                  </p>
                )}
                {e.reasons.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {e.reasons.map((r, j) => (
                      <li key={j} className="text-xs text-muted-foreground">• {r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* persistence findings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {suspicious.length > 0
              ? <ShieldAlert className="size-4 text-amber-400" />
              : <ShieldCheck className="size-4 text-emerald-400" />}
            What runs at startup — and why
          </CardTitle>
          <CardDescription>
            Every place Windows can auto-run something: scheduled tasks, Run keys, Startup folder, services, WMI
            subscriptions and logon hooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => scan(true)} loading={scanning}>
              {!scanning && <RefreshCw />} Scan again
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show only flagged" : `Show all (${findings?.length ?? 0})`}
            </Button>
          </div>

          {findings === null ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : shown.length === 0 ? (
            <Alert variant="success">
              Nothing suspicious is set to run at startup. {findings.length} entries checked.
            </Alert>
          ) : (
            shown.map((f) => (
              <div
                key={f.id}
                className={cn(
                  "glass cut-corner rounded-lg space-y-2 p-3",
                  f.level === "high" && "bg-red-500/10",
                  f.level === "medium" && "bg-amber-500/10"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {f.microsoft ? (
                    <Badge variant="success">Part of Windows</Badge>
                  ) : (
                    <Badge variant={LEVEL_BADGE[f.level]}>{LEVEL_LABEL[f.level]}</Badge>
                  )}
                  <span className="text-sm font-medium">{f.name}</span>
                  {!f.enabled && <Badge variant="secondary">Disabled</Badge>}
                </div>

                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <p className="flex items-center gap-1.5">
                    <FileWarning className="size-3" /> {f.source}
                    {f.location ? ` · ${f.location}` : ""}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Clock className="size-3" /> Runs: {f.trigger || "—"}
                    {f.runAs ? ` · as ${f.runAs}` : ""}
                  </p>
                </div>

                {f.command && (
                  <p className="break-all rounded bg-foreground/[0.07] p-2 font-mono text-xs text-muted-foreground">
                    {f.command}
                  </p>
                )}

                {f.reasons.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Why this was flagged</p>
                    <ul className="space-y-0.5">
                      {f.reasons.map((r, i) => (
                        <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {f.microsoft ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3 text-emerald-400" />
                    Signed by Microsoft. Windows needs this, so Anchor won't offer to disable it.
                  </p>
                ) : (
                  <DisableControl f={f} onAsk={() => setConfirm(f)} onFinished={() => scan(true)} />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        A flag isn't proof of malware — installers and game launchers legitimately use these mechanisms. Anchor explains
        what it saw so you can judge. If something was installed alongside a cracked game or a "loader", treat it with
        suspicion.
      </p>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={`Stop "${confirm?.name}" running at startup?`}
        description="Anchor disables rather than deletes: scheduled tasks and services are switched off, Run entries removed, and Startup files moved to a quarantine folder so you can put them back."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => confirm && disable(confirm)}>Disable it</Button>
          </>
        }
      >
        {confirm && (
          <p className="break-all font-mono text-xs text-muted-foreground">{confirm.command}</p>
        )}
      </Dialog>
    </div>
  );
}

function DisableControl({ f, onAsk, onFinished }: { f: BootFinding; onAsk: () => void; onFinished: () => void }) {
  const task = useTask<{ ok: boolean; error: string }>(`boot:disable:${f.id}`);
  const blocker = useBlockedBy("change");
  const running = task?.status === "running";
  const blockedMsg = blocker ? `${blocker.label} is already running` : undefined;

  // a finished disable refreshes the list (skipped on first mount: the page scans itself)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (task && task.status !== "running") onFinished();
  }, [task?.finishedAt]);

  const msg = running
    ? `Disabling ${f.name}…`
    : task?.status === "done"
    ? `${f.name} disabled. It will no longer run at startup.`
    : task?.status === "error"
    ? `Couldn't disable it: ${task.error}`
    : "";

  return (
    <div className="space-y-1">
      {f.enabled && (
        <Button size="sm" variant="outline" onClick={onAsk} loading={running} disabled={!!blockedMsg} title={blockedMsg}>
          Stop this running at startup
        </Button>
      )}
      {blockedMsg && f.enabled && <p className="text-xs text-muted-foreground">{blockedMsg}</p>}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
