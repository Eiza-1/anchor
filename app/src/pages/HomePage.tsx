import { useEffect, useState } from "react";
import { ShieldCheck, Stethoscope, Zap } from "lucide-react";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress,
} from "@/components/ui";
import { HealthList } from "@/components/HealthList";
import { runBoost, runHealthCheck, useAppState } from "@/lib/store";

export default function HomePage() {
  const { health, boost } = useAppState();
  const [greeting, setGreeting] = useState("Welcome to Anchor");
  const [restoreMsg, setRestoreMsg] = useState("");

  useEffect(() => {
    window.anchor.loadProfile().then((p) => {
      const h = new Date().getHours();
      const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
      setGreeting(p.name ? `${time}, ${p.name}!` : `${time}! Welcome to Anchor.`);
    });
  }, []);

  const healthPct = health.total ? (health.done / health.total) * 100 : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open-source Windows optimization. Every change is explained, reversible, and protected by a restore point.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4 text-sky-500" /> One-click Boost
          </CardTitle>
          <CardDescription>
            Creates a System Restore point, trims RAM used by background apps (never your open windows or taskbar
            apps), and clears temporary files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => runBoost({ includeTemp: true, includeRecycleBin: false, restorePoint: true })}
            loading={boost.running}
          >
            {!boost.running && <Zap />} Boost now
          </Button>
          {boost.message && <p className="text-sm text-muted-foreground">{boost.message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="size-4 text-sky-500" /> Health Check
          </CardTitle>
          <CardDescription>
            Windows Update status, drive health, disk space, and current CPU/memory pressure — read-only, changes
            nothing. Results appear as each check finishes, and keep running if you switch pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={runHealthCheck} loading={health.running}>
              {health.finishedAt && !health.running ? "Run again" : "Run Health Check"}
            </Button>
            {health.running && (
              <span className="text-xs text-muted-foreground">
                {health.done} of {health.total} checks done…
              </span>
            )}
            {!health.running && health.finishedAt && (
              <span className="text-xs text-muted-foreground">
                Last run {new Date(health.finishedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {health.running && <Progress value={healthPct} />}
          {health.lines.length > 0 && <HealthList lines={health.lines} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-500" /> Safety & transparency
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>• A System Restore point is created before any change, so everything can be rolled back.</p>
          <p>• Anchor is open source — the code behind every button is publicly viewable. No black boxes.</p>
          <p>• Nothing here phones home: news comes from public RSS feeds and your profile stays on this PC.</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setRestoreMsg("Creating restore point…");
                const r = await window.anchor.createRestorePoint("Anchor manual restore point");
                setRestoreMsg(r.message);
              }}
            >
              Create restore point manually
            </Button>
            {restoreMsg && <span className="text-xs">{restoreMsg}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
