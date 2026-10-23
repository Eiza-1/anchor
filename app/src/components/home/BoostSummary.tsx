// What a Boost did, in one row of chips: disk cleaned, memory, background CPU.
// "Details" opens the per-location and per-app lists underneath.
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Cpu, MemoryStick, Trash2 } from "lucide-react";
import type { BoostState } from "@/lib/store";
import { INSTANT, SPRING_SOFT, useReduceMotion } from "@/lib/motion";
import { cn, formatBytes } from "@/lib/utils";

export function BoostSummary({ boost, className }: { boost: BoostState; className?: string }) {
  const [open, setOpen] = useState(false);
  const reduce = useReduceMotion();
  const sys = boost.system;
  const trim = sys?.trim;
  const hogs = sys?.hogs ?? [];
  const lowered = hogs.filter((h) => h.lowered);
  const cleaned = boost.cleaned ?? 0;

  return (
    <div className={cn("ml-11 mt-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip icon={<Trash2 />} value={cleaned > 0 ? formatBytes(cleaned) : "Clean"} label={cleaned > 0 ? "cleaned" : "nothing to clear"} />
        {trim && (
          trim.ran
            ? <Chip icon={<MemoryStick />} value={formatBytes(trim.freedBytes)} label="RAM freed" />
            : <Chip icon={<MemoryStick />} value={`${trim.availPctBefore}%`} label="RAM free · OK" />
        )}
        {sys && (
          lowered.length
            ? <Chip icon={<Cpu />} value={String(lowered.length)} label={`background app${lowered.length === 1 ? "" : "s"} calmed`} />
            : <Chip icon={<Cpu />} value="Calm" label="background CPU" />
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          Details
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={reduce ? INSTANT : SPRING_SOFT}
            className="overflow-hidden"
          >
            <div className="grid gap-x-8 gap-y-3 pt-3 text-xs sm:grid-cols-2">
              <Section title="Cleaned">
                {(boost.items ?? []).map((i) => (
                  <Line key={i.name} k={i.name} v={i.freed > 0 ? formatBytes(i.freed) : "already clean"} dim={i.freed === 0} />
                ))}
              </Section>
              <div className="space-y-3">
                {trim && (
                  <Section title="Memory">
                    <p className="text-muted-foreground">
                      {trim.ran
                        ? `Trimmed ${trim.count} idle background app${trim.count === 1 ? "" : "s"} · free memory ${trim.availPctBefore}% → ${trim.availPctAfter}%`
                        : `${trim.availPctBefore}% free, so nothing was trimmed. Trimming only helps when memory is short; otherwise apps just reload it later.`}
                    </p>
                  </Section>
                )}
                {sys && (
                  <Section title="Background apps">
                    {hogs.length === 0 ? (
                      <p className="text-muted-foreground">Nothing in the background was using much CPU.</p>
                    ) : (
                      hogs.map((h) => (
                        <Line key={h.name} k={h.name} v={`${h.cpu}% CPU${h.lowered ? " · lowered" : ""}`} />
                      ))
                    )}
                    {lowered.length > 0 && (
                      <p className="pt-1 text-muted-foreground/80">Set to low priority until they restart. Nothing was closed.</p>
                    )}
                  </Section>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-[hsl(var(--glass))] px-2.5 py-1 text-xs [&_svg]:size-3.5 [&_svg]:text-primary">
      {icon}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{title}</p>
      {children}
    </div>
  );
}

function Line({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="truncate text-foreground/85">{k}</span>
      <span className={cn("shrink-0 tabular-nums", dim ? "text-muted-foreground" : "text-foreground")}>{v}</span>
    </p>
  );
}
