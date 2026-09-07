// Bottleneck detection and CPU/GPU pairing assessment.
//
// Deliberately based on MEASURED utilisation rather than spec sheets. Comparing
// model names against a benchmark table would be guesswork about your actual
// workload; watching which component saturates first while you play or work is
// how the answer is really determined.

export interface Sample {
  t: number;
  cpu: number | null;
  gpu: number | null;
  disk: number | null;
  memUsed: number | null;
  memTotal: number | null;
  vram: number | null;
}

export type Culprit = "cpu" | "gpu" | "disk" | "memory" | "balanced" | "idle";

export interface Verdict {
  culprit: Culprit;
  headline: string;
  detail: string;
  /** 0-1, how much of the recent window supports this call */
  confidence: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const nn = (xs: (number | null)[]) => xs.filter((x): x is number => typeof x === "number");

/** Samples where the machine was actually doing something worth measuring. */
export function underLoad(samples: Sample[]) {
  return samples.filter((s) => (s.cpu ?? 0) > 25 || (s.gpu ?? 0) > 25);
}

/** What is limiting the system right now (last few seconds). */
export function liveVerdict(samples: Sample[]): Verdict {
  const recent = samples.slice(-5);
  if (recent.length === 0)
    return { culprit: "idle", headline: "Waiting for data…", detail: "", confidence: 0 };

  const cpu = avg(nn(recent.map((s) => s.cpu)));
  const gpu = avg(nn(recent.map((s) => s.gpu)));
  const disk = avg(nn(recent.map((s) => s.disk)));
  const memPct = (() => {
    const last = recent[recent.length - 1];
    return last.memUsed && last.memTotal ? (last.memUsed / last.memTotal) * 100 : 0;
  })();

  if (memPct > 92)
    return {
      culprit: "memory",
      headline: "Memory is the limit",
      detail: `RAM is ${Math.round(memPct)}% full, so Windows is paging to disk — that stalls everything regardless of CPU or GPU speed.`,
      confidence: 0.9,
    };

  if (disk > 85 && cpu < 70 && gpu < 70)
    return {
      culprit: "disk",
      headline: "Storage is the limit",
      detail: "The drive is saturated while CPU and GPU wait. Common when loading levels, copying files, or on a mechanical drive.",
      confidence: 0.8,
    };

  if (cpu < 20 && gpu < 20)
    return {
      culprit: "idle",
      headline: "Nothing is under load",
      detail: "Start a game or heavy app and leave this page open — Anchor keeps measuring while you do.",
      confidence: 0.3,
    };

  const gap = gpu - cpu;

  if (gpu >= 88 && gap > 15)
    return {
      culprit: "gpu",
      headline: "GPU-bound",
      detail: `The graphics card is at ${Math.round(gpu)}% while the CPU sits at ${Math.round(cpu)}%. For games this is the healthy state — you're getting everything the GPU can give.`,
      confidence: Math.min(1, 0.6 + gap / 100),
    };

  if (cpu >= 85 && gap < -15)
    return {
      culprit: "cpu",
      headline: "CPU-bound",
      detail: `The processor is at ${Math.round(cpu)}% while the GPU only reaches ${Math.round(gpu)}%. The graphics card is waiting for work — frames are limited by the CPU.`,
      confidence: Math.min(1, 0.6 + Math.abs(gap) / 100),
    };

  if (cpu >= 80 && gpu >= 80)
    return {
      culprit: "balanced",
      headline: "Both fully loaded",
      detail: "CPU and GPU are saturating together — that's an evenly matched system working as hard as it can.",
      confidence: 0.75,
    };

  return {
    culprit: "balanced",
    headline: "No single bottleneck",
    detail: `CPU ${Math.round(cpu)}%, GPU ${Math.round(gpu)}% — neither is pinned, so something else (frame cap, game settings, or the app itself) is setting the pace.`,
    confidence: 0.5,
  };
}

export interface Pairing {
  status: "unknown" | "balanced" | "gpu-limited" | "cpu-limited";
  headline: string;
  detail: string;
  advice: string;
  samples: number;
  cpuAvg: number;
  gpuAvg: number;
}

/**
 * Are these two components a sensible match? Judged from sustained load only —
 * needs roughly a minute of real work (a game, render, or compile) to be useful.
 */
export function assessPairing(samples: Sample[], cpuName?: string, gpuName?: string): Pairing {
  const load = underLoad(samples);
  const cpuAvg = avg(nn(load.map((s) => s.cpu)));
  const gpuAvg = avg(nn(load.map((s) => s.gpu)));

  if (load.length < 20)
    return {
      status: "unknown",
      headline: "Not enough data yet",
      detail: `Anchor needs about a minute of real load to judge this. ${load.length} of 20 samples collected — start a game or heavy app and leave this page open.`,
      advice: "",
      samples: load.length,
      cpuAvg,
      gpuAvg,
    };

  const gap = gpuAvg - cpuAvg;
  const pair = [cpuName, gpuName].filter(Boolean).join(" + ");

  if (gap > 25)
    return {
      status: "gpu-limited",
      headline: "Your GPU is the weaker half",
      detail: `Under load the GPU averages ${Math.round(gpuAvg)}% while the CPU only needs ${Math.round(cpuAvg)}%. The processor has capacity to spare${pair ? ` — ${pair}` : ""}.`,
      advice: "A faster graphics card would translate almost directly into more frames. Lowering resolution or graphics settings also helps immediately.",
      samples: load.length,
      cpuAvg,
      gpuAvg,
    };

  if (gap < -25)
    return {
      status: "cpu-limited",
      headline: "Your CPU is holding the GPU back",
      detail: `Under load the CPU averages ${Math.round(cpuAvg)}% while the GPU only reaches ${Math.round(gpuAvg)}%. The graphics card is idling between frames${pair ? ` — ${pair}` : ""}.`,
      advice: "Raising resolution or graphics quality costs little here — the GPU has headroom. A CPU upgrade would give the biggest gain; closing background apps helps in the meantime.",
      samples: load.length,
      cpuAvg,
      gpuAvg,
    };

  return {
    status: "balanced",
    headline: "Well matched",
    detail: `Under load CPU averages ${Math.round(cpuAvg)}% and GPU ${Math.round(gpuAvg)}% — neither consistently waits on the other${pair ? ` — ${pair}` : ""}.`,
    advice: "Nothing to fix. Upgrading either part alone would give limited benefit; they're working together.",
    samples: load.length,
    cpuAvg,
    gpuAvg,
  };
}
