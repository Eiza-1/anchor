// Ctrl+Shift+F: a small frame-rate readout, for checking animations by feel and
// by number. It measures nothing while hidden. The display's refresh rate is the
// typical gap between frames; a frame that took 1.5× that or longer is counted
// as dropped (the screen showed the previous frame again).
import { useEffect, useState } from "react";

const WINDOW_MS = 5000;

type Stats = { hz: number; fps: number; dropped: number; worst: number };

export function FpsMeter() {
  const [shown, setShown] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        setShown((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!shown) { setStats(null); return; }
    const frames: { t: number; gap: number }[] = [];
    let last = 0;
    let raf = 0;
    let lastPaint = 0;
    const tick = (t: number) => {
      if (last) frames.push({ t, gap: t - last });
      last = t;
      while (frames.length && frames[0].t < t - WINDOW_MS) frames.shift();
      if (t - lastPaint > 250 && frames.length > 10) {
        lastPaint = t;
        setStats(summarize(frames.map((f) => f.gap), frames.filter((f) => f.t > t - 1000).length));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="glass-strong pointer-events-none fixed bottom-3 left-3 z-[100] rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed tabular-nums text-foreground">
      {stats ? (
        <>
          <div>
            <span className={stats.fps >= stats.hz * 0.95 ? "text-primary" : "text-amber-400"}>{stats.fps} fps</span>
            <span className="text-muted-foreground"> / {stats.hz} Hz display</span>
          </div>
          <div className="text-muted-foreground">
            {stats.dropped} dropped · worst {stats.worst.toFixed(1)} ms <span className="opacity-60">(last 5 s)</span>
          </div>
        </>
      ) : (
        <div className="text-muted-foreground">measuring…</div>
      )}
    </div>
  );
}

/** Frame gaps (ms) over the window, and frames in the last second → readout. */
export function summarize(gaps: number[], lastSecond: number): Stats {
  const sorted = [...gaps].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)] || 16.7;
  return {
    hz: Math.round(1000 / typical),
    fps: lastSecond,
    dropped: gaps.filter((g) => g >= typical * 1.5).length,
    worst: sorted[sorted.length - 1] ?? 0,
  };
}
