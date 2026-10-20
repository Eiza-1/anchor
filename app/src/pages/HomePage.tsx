import { useEffect, useState } from "react";
import { Stethoscope, Zap } from "lucide-react";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress,
} from "@/components/ui";
import { greetingFor } from "@/lib/utils";
import { HealthList } from "@/components/HealthList";
import { runBoost, runHealthCheck, useAppState } from "@/lib/store";
import { useBlockedBy, useTask } from "@/lib/tasks";

export default function HomePage() {
  const { health, boost } = useAppState();
  const [greeting, setGreeting] = useState("Welcome to Anchor");

  useEffect(() => {
    window.anchor.loadProfile().then((p) => setGreeting(greetingFor(p)));
  }, []);

  const boostTask = useTask("home:boost");
  const blocker = useBlockedBy("cleanup");
  const blockedMsg = blocker && blocker.key !== "home:boost" ? `${blocker.label} is already running` : undefined;

  const healthPct = health.total ? (health.done / health.total) * 100 : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open-source Windows optimization. Every change is explained and reversible.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4 text-sky-500" /> One-click Boost
          </CardTitle>
          <CardDescription>
            Clears temp files, old update downloads, crash dumps and other leftovers. Personal files are never
            touched. Choose exactly what to clear on the Cleanup page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={runBoost} loading={boost.running} disabled={!!blockedMsg} title={blockedMsg}>
            {!boost.running && <Zap />} Boost now
          </Button>
          {blockedMsg && <p className="text-xs text-muted-foreground">{blockedMsg}</p>}
          {boostTask?.status === "error" && (
            <p className="text-sm text-destructive">Boost failed: {boostTask.error}</p>
          )}
          {boost.message && <p className="text-sm text-muted-foreground">{boost.message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="size-4 text-sky-500" /> Health Check
          </CardTitle>
          <CardDescription>
            Windows Update, drive health, disk space, hardware faults and current load. Read-only — results stream in
            as each check finishes, and it keeps running if you switch pages.
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
                Last run {new Date(health.finishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            )}
          </div>

          {health.running && <Progress value={healthPct} />}
          {health.lines.length > 0 && <HealthList lines={health.lines} />}
        </CardContent>
      </Card>
    </div>
  );
}
