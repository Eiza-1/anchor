import {
  AlertTriangle, Check, CircuitBoard, Cpu, Gauge, HardDrive, Info, Lightbulb,
  MemoryStick, MonitorCog, RefreshCw, Save, HardDriveDownload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthIcon, HealthLine, HealthStatus } from "@/lib/store";

const ICONS: Record<HealthIcon, React.ComponentType<{ className?: string }>> = {
  windows: MonitorCog,
  update: RefreshCw,
  ssd: HardDriveDownload,
  hdd: HardDrive,
  disk: Save,
  cpu: Cpu,
  memory: MemoryStick,
  gauge: Gauge,
  tip: Lightbulb,
  device: CircuitBoard,
};

const TONE: Record<HealthStatus, string> = {
  ok: "text-emerald-400 bg-emerald-500/10",
  warn: "text-amber-400 bg-amber-500/10",
  bad: "text-red-400 bg-red-500/10",
  info: "text-sky-400 bg-sky-500/10",
  tip: "text-violet-400 bg-violet-500/10",
};

const STATUS_BADGE: Partial<Record<HealthStatus, React.ComponentType<{ className?: string }>>> = {
  ok: Check,
  warn: AlertTriangle,
  bad: AlertTriangle,
  info: Info,
};

export function HealthList({ lines }: { lines: HealthLine[] }) {
  const sorted = [...lines].sort((a, b) => a.order - b.order);
  return (
    <ul className="space-y-2">
      {sorted.map((l) => {
        const Icon = ICONS[l.icon];
        const Badge = STATUS_BADGE[l.status];
        return (
          <li key={l.id} className="flex items-start gap-3 rounded-lg border bg-card/50 p-3">
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", TONE[l.status])}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {l.title}
                {Badge && l.status !== "info" && (
                  <Badge className={cn("size-3.5", l.status === "ok" ? "text-emerald-400" : l.status === "warn" ? "text-amber-400" : "text-red-400")} />
                )}
              </p>
              {l.detail && <p className="text-xs text-muted-foreground">{l.detail}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
