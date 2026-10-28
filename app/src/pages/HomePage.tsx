// Home, GX Corner style: greeting and quick actions over the picture, the
// Health Check / Boost panel, then the release calendar and free games rows.
import { useEffect, useState } from "react";
import { HeartPulse, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { ResultPanel } from "@/components/home/ResultPanel";
import { ReleaseRail } from "@/components/home/ReleaseRail";
import { FreeRail } from "@/components/home/FreeRail";
import { greetingFor } from "@/lib/utils";
import { timeAgo } from "@/lib/games";
import { runBoost, runHealthCheck, useAppState, type HealthState } from "@/lib/store";
import { useBlockedBy, useTask } from "@/lib/tasks";

let lastGreeting = "";

function healthSummary(h: HealthState, now: number): string {
  if (h.running) return "Checking your PC…";
  if (!h.finishedAt || h.lines.length === 0) return "Run a Health Check to see how your PC is doing";
  const n = h.lines.filter((l) => l.status === "bad" || l.status === "warn").length;
  const when = `last checked ${timeAgo(h.finishedAt, now)}`;
  return n === 0 ? `Your PC looks healthy · ${when}` : `${n} issue${n === 1 ? "" : "s"} found · ${when}`;
}

export default function HomePage() {
  const { health, boost } = useAppState();
  const healthTask = useTask("home:health");
  const boostTask = useTask("home:boost");
  const blocker = useBlockedBy("cleanup");
  const blockedMsg = blocker && blocker.key !== "home:boost" ? `${blocker.label} is already running` : undefined;

  // remembered across visits so the heading doesn't flicker from a placeholder
  const [greeting, setGreeting] = useState(lastGreeting || greetingFor(null));
  useEffect(() => {
    window.anchor.loadProfile()
      .then((p) => { lastGreeting = greetingFor(p); setGreeting(lastGreeting); })
      .catch(() => {});
  }, []);

  // keeps "last checked 5 minutes ago" current while Home is open
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const boosting = boost.running || boostTask?.status === "running";
  const checking = health.running || healthTask?.status === "running";

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-4 pt-5">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[40px] font-bold leading-tight tracking-[-0.02em] dark:[text-shadow:0_2px_20px_rgb(0_0_0/0.4)]">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-foreground/80 dark:[text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">
            {healthSummary(health, now)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <Button
            className="glass-blur"
            onClick={() => void runBoost()}
            loading={boosting}
            disabled={!!blockedMsg}
            title={blockedMsg ?? "Clear temp files, update leftovers and crash dumps"}
          >
            {!boosting && <Zap />} Boost now
          </Button>
          <Button
            variant="outline"
            className="glass-blur"
            onClick={() => void runHealthCheck()}
            loading={checking}
            title="Checks Windows Update, drive health, disk space and hardware faults. Read-only."
          >
            {!checking && <HeartPulse />} Health Check
          </Button>
        </div>
      </header>

      <ResultPanel />

      <ReleaseRail />

      <div className="my-5 h-px bg-gradient-to-r from-transparent via-foreground/35 to-transparent" />

      <FreeRail />
    </div>
  );
}
