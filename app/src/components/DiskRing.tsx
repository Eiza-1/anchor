import { motion } from "framer-motion";
import { SPRING_SOFT } from "@/lib/motion";
import { formatBytes } from "@/lib/utils";
import type { VolumeStats } from "@/lib/drives";

const SIZE = 112;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export function DiskRing({ stats, label }: { stats: VolumeStats; label: string }) {
  const color =
    stats.level === "critical" ? "rgb(248 113 113)" : stats.level === "low" ? "rgb(251 191 36)" : "hsl(var(--primary))";
  const target = C * (1 - Math.min(Math.max(stats.usedPct, 0), 100) / 100);
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" role="img"
          aria-label={`${label} ${Math.round(stats.usedPct)}% used`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE} />
          <motion.circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={color} strokeWidth={STROKE}
            strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: target }} transition={SPRING_SOFT}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className="text-xl font-semibold">{Math.round(stats.usedPct)}%</span>
          <span className="text-xs text-muted-foreground">used</span>
        </div>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <Row k="Used" v={formatBytes(stats.used)} />
        <Row k="Free" v={formatBytes(stats.free)} />
        <Row k="Total" v={formatBytes(stats.total)} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex items-baseline gap-2 text-xs text-muted-foreground">
      <span className="w-9">{k}</span>
      <span className="text-[15px] font-semibold text-foreground">{v}</span>
    </p>
  );
}
