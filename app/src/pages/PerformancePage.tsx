import { useEffect, useState } from "react";
import {
  Activity, Cpu, Gauge, Lightbulb, MemoryStick, MonitorPlay, Pause, Play, RotateCcw, Scale,
} from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress,
} from "@/components/ui";
import { formatBytes, cn } from "@/lib/utils";
import { assessPairing, liveVerdict, underLoad, type Sample } from "@/lib/bottleneck";
import {
  clearSamples, isMonitoring, startMonitor, stopMonitor, useSamples,
} from "@/lib/store";
import { Q } from "@/lib/queries";

type Proc = { name: string; count: number; bytes: number };

export default function PerformancePage() {
  const samples = useSamples();
  const [running, setRunning] = useState(isMonitoring());
  const [procs, setProcs] = useState<Proc[]>([]);
  const [cpuName, setCpuName] = useState("");
  const [gpuName, setGpuName] = useState("");

  useEffect(() => {
    startMonitor();
    setRunning(true);
    Q.cpuInfo().then((c) => {
      if (c) setCpuName(`${c.name} (${c.cores}C/${c.threads}T)`);
    });
    Q.gpuInfo().then((g) => {
      const main = g.find((x) => !x.errorCode) ?? g[0];
      if (main) setGpuName(main.name);
    });
    window.anchor.topProcesses().then(setProcs);
    // keep monitoring when navigating away; only the page's own timer stops
    return () => {};
  }, []);

  const last: Sample | undefined = samples[samples.length - 1];
  const verdict = liveVerdict(samples);
  const pairing = assessPairing(samples, cpuName, gpuName);
  const loadSamples = underLoad(samples).length;

  const memPct = last?.memUsed && last?.memTotal ? (last.memUsed / last.memTotal) * 100 : 0;

  const TONE: Record<string, string> = {
    // a status tint over the glass (the tint replaces the glass fill; the glass edge stays).
    // GPU keeps sky blue rather than the theme accent: it's the GPU series colour in
    // the sparkline below, and must not collide with CPU's amber on Ember/Crimson.
    cpu: "bg-amber-500/10",
    gpu: "bg-sky-500/10",
    disk: "bg-amber-500/10",
    memory: "bg-red-500/10",
    balanced: "bg-emerald-500/10",
    idle: "",
  };

  return (
    <div className="page-column space-y-6 py-6">

      {/* live bottleneck verdict */}
      <div className={cn("glass cut-corner rounded-lg p-4", TONE[verdict.culprit])}>
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{verdict.headline}</p>
            {verdict.detail && <p className="mt-1 text-sm text-muted-foreground">{verdict.detail}</p>}
          </div>
        </div>
      </div>

      {/* live meters */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Right now</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (running) { stopMonitor(); setRunning(false); }
                else { startMonitor(); setRunning(true); }
              }}
            >
              {running ? <><Pause /> Pause</> : <><Play /> Resume</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSamples}><RotateCcw /> Reset</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Meter icon={Cpu} label="CPU" value={last?.cpu ?? 0} sub={cpuName} />
          <Meter
            icon={MonitorPlay}
            label="GPU"
            value={last?.gpu ?? 0}
            sub={gpuName || (last?.gpu === null ? "No GPU counters available" : "")}
          />
          <Meter
            icon={MemoryStick}
            label="Memory"
            value={memPct}
            sub={last?.memUsed && last?.memTotal ? `${formatBytes(last.memUsed)} of ${formatBytes(last.memTotal)}` : ""}
          />
          <Meter icon={Gauge} label="Disk activity" value={last?.disk ?? 0} />
          <Sparkline samples={samples} />
        </CardContent>
      </Card>

      {/* CPU / GPU pairing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-4 text-primary" /> Are your CPU and GPU a good match?
          </CardTitle>
          <CardDescription>
            Judged from what your hardware actually does under load, not from model names. Needs about a minute of real
            work — a game, a render, a compile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                pairing.status === "balanced" ? "success"
                : pairing.status === "unknown" ? "secondary"
                : "warning"
              }
            >
              {pairing.headline}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {loadSamples} samples under load
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{pairing.detail}</p>
          {pairing.advice && (
            <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-violet-400" />
              <span>{pairing.advice}</span>
            </p>
          )}
          {pairing.status !== "unknown" && (
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              <div className="glass cut-corner rounded-lg p-3">
                <p className="text-xs text-muted-foreground">CPU average under load</p>
                <p className="text-lg font-semibold">{Math.round(pairing.cpuAvg)}%</p>
              </div>
              <div className="glass cut-corner rounded-lg p-3">
                <p className="text-xs text-muted-foreground">GPU average under load</p>
                <p className="text-lg font-semibold">{Math.round(pairing.gpuAvg)}%</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top memory users</CardTitle>
          <CardDescription>
            Private memory — what each app uses on its own, excluding shared system libraries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.anchor.topProcesses().then(setProcs)}
          >
            Refresh
          </Button>
          {procs.map((p) => (
            <div key={p.name} className="flex items-center justify-between text-sm">
              <span>{p.name}{p.count > 1 ? ` (${p.count} processes)` : ""}</span>
              <span className="text-muted-foreground">{formatBytes(p.bytes)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Meter({
  icon: Icon, label, value, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; sub?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="size-3.5 text-muted-foreground" /> {label}
        </span>
        <span className="text-muted-foreground">{Math.round(value)}%</span>
      </div>
      <Progress value={value} />
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Tiny CPU-vs-GPU history strip — shows at a glance which one leads. */
function Sparkline({ samples }: { samples: Sample[] }) {
  const recent = samples.slice(-60);
  if (recent.length < 2) return null;
  return (
    <div>
      <div className="mb-1 flex gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" /> CPU</span>
        {/* series colours, not the accent: fixed so CPU and GPU never look alike on any theme */}
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-400" /> GPU</span>
        <span className="ml-auto">last {recent.length}s</span>
      </div>
      <div className="flex h-14 items-end gap-px">
        {recent.map((s, i) => (
          <div key={i} className="relative flex-1" style={{ height: "100%" }}>
            <div
              className="absolute bottom-0 w-full rounded-sm bg-amber-400/70"
              style={{ height: `${s.cpu ?? 0}%` }}
            />
            <div
              className="absolute bottom-0 w-full rounded-sm bg-sky-400/60"
              style={{ height: `${s.gpu ?? 0}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
