import { Badge } from "@/components/ui";

export type Gpu = {
  name: string; driver: string; driverDate: string | null;
  ageDays: number | null; errorCode?: number;
  dedicated: number | null; shared: number | null; hwSchSupported: boolean | null;
};

const SIZE = 112; // same footprint as the Disk space ring

/** "128 MB", "4 GB", "1.5 GB" — number and unit apart so the number can lead. */
function vramParts(bytes: number): [string, string] {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return [String(Math.round(gb * 10) / 10), "GB"];
  return [String(Math.round(bytes / 1024 ** 2)), "MB"];
}

/** One GPU: its dedicated video memory as the headline, details beside it. */
export function GpuCard({ gpu: g }: { gpu: Gpu }) {
  const stale = g.ageDays !== null && g.ageDays > 365;
  const aging = g.ageDays !== null && g.ageDays > 180 && !stale;
  const [num, unit] = g.dedicated ? vramParts(g.dedicated) : ["—", ""];
  return (
    <div className="glass cut-corner rounded-lg p-3">
      <div className="flex items-center gap-4">
        <div
          className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 leading-tight"
          style={{ width: SIZE, height: SIZE }}
          role="img"
          aria-label={g.dedicated ? `${num} ${unit} of dedicated video memory` : "Video memory unknown"}
        >
          <span className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold tabular-nums">{num}</span>
            {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">VRAM</span>
        </div>

        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{g.name}</p>
          <Row k="Driver" v={g.driver} />
          {g.driverDate && <Row k="Date" v={g.driverDate} />}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {g.errorCode ? (
              <Badge variant="destructive">Not working — Device Manager code {g.errorCode}</Badge>
            ) : null}
            {g.ageDays !== null && (
              <Badge variant={stale ? "warning" : aging ? "secondary" : "success"}>
                {stale
                  ? `Driver is ${Math.round(g.ageDays / 30)} months old — check your GPU vendor for an update`
                  : aging
                  ? `Driver is ${Math.round(g.ageDays / 30)} months old`
                  : "Driver is recent"}
              </Badge>
            )}
            {g.hwSchSupported === false && <Badge variant="secondary">No GPU scheduling support</Badge>}
          </div>
        </div>
      </div>

      {g.errorCode === 43 && (
        <p className="mt-2 text-xs text-red-400">
          Windows stopped this GPU because it reported problems. Games will fall back to the other adapter.
          Reinstall the vendor driver; if the code returns, the card may need service.
        </p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex items-baseline gap-2 text-xs text-muted-foreground">
      <span className="w-11">{k}</span>
      <span className="truncate text-[13px] font-medium text-foreground">{v}</span>
    </p>
  );
}
