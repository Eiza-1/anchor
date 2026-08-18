import { useEffect, useState } from "react";
import { Activity, Lightbulb } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui";
import { formatBytes } from "@/lib/utils";

type Perf = { cpu: number; disk: number; memTotal: number; memUsed: number };
type Proc = { name: string; count: number; bytes: number };

export default function PerformancePage() {
  const [perf, setPerf] = useState<Perf | null>(null);
  const [procs, setProcs] = useState<Proc[]>([]);
  const [loading, setLoading] = useState(false);

  async function sample() {
    setLoading(true);
    const [p, t] = await Promise.all([window.anchor.perfSample(), window.anchor.topProcesses()]);
    setPerf(p);
    setProcs(t);
    setLoading(false);
  }
  useEffect(() => { sample(); }, []);

  const memPct = perf ? Math.round((perf.memUsed / perf.memTotal) * 100) : 0;
  const tips: string[] = [];
  if (perf) {
    if (perf.cpu > 85) tips.push("CPU is a bottleneck right now. Check the top processes below — closing or updating the heaviest app usually helps most.");
    if (memPct > 85) tips.push(`Memory pressure is high (${memPct}%). Run Boost to trim background apps, or disable startup apps you don't need.`);
    if (perf.memTotal < 8 * 1024 ** 3) tips.push("This PC has less than 8 GB of RAM — a RAM upgrade is the single most effective hardware fix for sluggishness.");
    if (perf.disk > 80) tips.push("Disk is very busy. If this is an HDD, upgrading to an SSD is transformative. Also check Storage Sense and Windows Search indexing.");
    if (tips.length === 0) tips.push("No bottlenecks detected right now — CPU, memory, and disk all have headroom.");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live look at CPU, memory, and disk with plain-language bottleneck suggestions.
        </p>
      </div>

      <Button onClick={sample} loading={loading}>
        {!loading && <Activity />} Sample now
      </Button>

      <Card>
        <CardHeader><CardTitle>Current load</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Metric label="CPU" value={perf?.cpu ?? 0} text={`${perf?.cpu ?? 0}%`} />
          <Metric
            label="Memory"
            value={memPct}
            text={perf ? `${memPct}% — ${formatBytes(perf.memUsed)} of ${formatBytes(perf.memTotal)}` : "—"}
          />
          <Metric label="Disk activity" value={perf?.disk ?? 0} text={`${perf?.disk ?? 0}%`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Suggestions</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {tips.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-violet-400" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top memory users</CardTitle>
          <p className="text-sm text-muted-foreground">
            Private memory — memory only that app is using, excluding shared system libraries.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
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

function Metric({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{text}</span>
      </div>
      <Progress value={value} />
    </div>
  );
}
