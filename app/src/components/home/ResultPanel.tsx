// The panel under Home's header: Health Check streaming in, and Boost's result.
// Both jobs live in the store, so leaving Home mid-run and coming back shows the
// run still going (or its result). × hides the panel until the next run.
import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Stethoscope, X, Zap } from "lucide-react";
import { HealthList } from "@/components/HealthList";
import { Progress } from "@/components/ui";
import { useAppState } from "@/lib/store";
import { useTask } from "@/lib/tasks";
import { INSTANT, SPRING, SPRING_SOFT, useReduceMotion } from "@/lib/motion";
import { cn, formatBytes } from "@/lib/utils";

// Which runs were dismissed, by their start time. Module-level so it survives
// page switches; a new run has a new start time and shows again.
const dismissed = { health: 0, boost: 0 };

export function ResultPanel() {
  const { health, boost } = useAppState();
  const healthTask = useTask("home:health");
  const boostTask = useTask("home:boost");
  const [, rerender] = useState(0);
  const reduce = useReduceMotion();

  // only runs from this session: a check saved from last launch is the header's summary
  const showHealth = !!healthTask && dismissed.health !== healthTask.startedAt;
  const showBoost = !!boostTask && dismissed.boost !== boostTask.startedAt;

  const close = () => {
    if (healthTask) dismissed.health = healthTask.startedAt;
    if (boostTask) dismissed.boost = boostTask.startedAt;
    rerender((n) => n + 1);
  };

  const healthPct = health.total ? (health.done / health.total) * 100 : 0;
  const boostRunning = boostTask?.status === "running" || boost.running;
  const showItems = showBoost && !boostRunning && !!boost.items?.length;
  const boostText = boostTask?.status === "error"
    ? `Boost failed: ${boostTask.error ?? "something went wrong"}`
    : boost.message || (boostRunning ? "Boosting…" : boostTask?.summary ?? "");

  return (
    <AnimatePresence initial={false}>
      {(showHealth || showBoost) && (
        <motion.div
          key="panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={reduce ? INSTANT : SPRING_SOFT}
          className="overflow-hidden"
        >
          <AutoHeight>
            <div className="glass cut-corner relative mb-7 rounded-lg p-5 pr-12">
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute right-3 top-3 z-[2] grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>

              {showBoost && (
                <div className={cn("flex items-center gap-3", showHealth && !showItems && "mb-5")}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                    {boostRunning ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Boost</p>
                    <p className={cn("text-xs", boostTask?.status === "error" ? "text-destructive dark:text-red-400" : "text-muted-foreground")}>
                      {boostText}
                    </p>
                  </div>
                </div>
              )}
              {showItems && (
                <ul className={cn("ml-11 mt-3 max-w-md space-y-1 text-xs", showHealth && "mb-5")}>
                  {boost.items!.map((i) => (
                    <li key={i.name} className="flex justify-between gap-4">
                      <span className="truncate text-foreground/85">{i.name}</span>
                      <span className={cn("shrink-0 tabular-nums", i.freed > 0 ? "text-foreground" : "text-muted-foreground")}>
                        {i.freed > 0 ? formatBytes(i.freed) : "already clean"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {showHealth && (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                      {health.running ? <Loader2 className="size-4 animate-spin" /> : <Stethoscope className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Health Check</p>
                      <p className="text-xs text-muted-foreground">
                        {health.running
                          ? `${health.done} of ${health.total} checks done…`
                          : healthTask?.status === "error"
                          ? `Health Check failed: ${healthTask.error ?? "something went wrong"}`
                          : healthTask?.summary ?? "Done"}
                      </p>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {health.running && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={SPRING}
                        className="mb-3"
                      >
                        <Progress value={healthPct} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {health.lines.length > 0 && <HealthList lines={health.lines} className="grid gap-2 space-y-0 lg:grid-cols-2" />}
                </div>
              )}
            </div>
          </AutoHeight>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Springs its height to its content, so lines streaming in grow the panel smoothly. */
function AutoHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">("auto");
  const reduce = useReduceMotion();
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div initial={false} animate={{ height: h }} transition={reduce ? INSTANT : SPRING_SOFT} className="overflow-hidden">
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}
