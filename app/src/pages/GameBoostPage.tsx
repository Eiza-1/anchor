import { useEffect, useState } from "react";
import { Cpu, Eraser, Gamepad2, MonitorPlay, Plus, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Select, Skeleton, Switch,
} from "@/components/ui";
import { countSummary, formatBytes } from "@/lib/utils";
import { invalidate, peek, remember } from "@/lib/store";
import { Q } from "@/lib/queries";
import { GpuCard, type Gpu } from "@/components/GpuCard";
import { runTask, useBlockedBy, useTask } from "@/lib/tasks";

const PERF_WHERE = { section: "performance", tab: "boost" };

type Tweak = import("@/types").PerfTweak;
type PowerPlan = { active: string; plans: { guid: string; name: string }[]; ultimateCopies: number };
type GpuPref = { path: string; value: string };

// What each tweak really changes — so nobody expects a desktop tweak to add frames.
const EFFECT: Record<Tweak["effect"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  fps: { label: "FPS", variant: "default" },
  smoothness: { label: "Smoothness", variant: "outline" },
  latency: { label: "Input latency", variant: "outline" },
  desktop: { label: "Desktop only", variant: "secondary" },
};
const CATEGORY_NOTE: Record<string, string> = {
  Gaming: "Free up CPU time and memory for the game you're playing.",
  Graphics: "How Windows hands frames to your display.",
  Desktop: "These make Windows itself feel faster. They don't change in-game frame rates.",
};

export default function GameBoostPage() {
  const [tweaks, setTweaks] = useState<Tweak[] | null>(peek<Tweak[]>("perf:tweaks") ?? null);
  const [power, setPower] = useState<PowerPlan | null>(peek<PowerPlan>("perf:power") ?? null);
  const [gpu, setGpu] = useState<GpuPref[]>(peek<GpuPref[]>("perf:gpuPrefs") ?? []);
  const [gpus, setGpus] = useState<Gpu[]>(peek<Gpu[]>("perf:gpuInfo") ?? []);
  const [pcieSaving, setPcieSaving] = useState<boolean | null>(peek<{ saving: boolean }>("perf:pcie")?.saving ?? null);
  const recTask = useTask("perf:recommended");
  const revTask = useTask("perf:revert");
  const shaderTask = useTask<{ bytes: number; cleared: string[] }>("perf:shaders");
  const blocker = useBlockedBy("perf");
  const recBusy = recTask?.status === "running";
  const revBusy = revTask?.status === "running";
  const shaderBusy = shaderTask?.status === "running";
  // message only when a DIFFERENT task blocks a control (its own spinner already says it's running)
  const blockedBy = (ownKey: string) =>
    blocker && blocker.key !== ownKey ? `${blocker.label} is already running` : undefined;
  const recBlocked = blockedBy("perf:recommended");
  const revBlocked = blockedBy("perf:revert");

  async function load(force = false) {
    if (force) invalidate("perf:tweaks", "perf:power", "perf:gpuPrefs", "perf:gpuInfo", "perf:pcie");
    // each section fills in as soon as its own data arrives
    await Promise.allSettled([
      Q.perfTweaks().then(setTweaks),
      Q.powerPlan().then(setPower),
      Q.gpuPrefs().then(setGpu),
      Q.gpuInfo().then(setGpus),
      Q.pcie().then((p) => setPcieSaving(p.saving)),
    ]);
  }
  useEffect(() => { load(); }, []);
  // keep the cache in step with toggles, so coming back shows the real state
  useEffect(() => { if (tweaks) remember("perf:tweaks", tweaks); }, [tweaks]);
  useEffect(() => { if (power) remember("perf:power", power); }, [power]);
  useEffect(() => { remember("perf:gpuPrefs", gpu); }, [gpu]);
  useEffect(() => { if (pcieSaving !== null) remember("perf:pcie", { saving: pcieSaving }); }, [pcieSaving]);

  const restartNeeded = tweaks?.some((t) => t.pendingRestart);
  const [planMsg, setPlanMsg] = useState("");

  function toggle(t: Tweak, on: boolean) {
    const setApplied = (applied: boolean) =>
      setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied } : x)) ?? null);
    setApplied(on);
    runTask(
      `perf:${t.id}`,
      {
        label: "Performance tweak",
        where: PERF_WHERE,
        group: "perf",
        isError: (r: { ok: boolean; error: string }) => (r.ok ? null : r.error || "Couldn't change this tweak"),
        summarize: () => `${t.name} ${on ? "on" : "off"}`,
      },
      async () => {
        const r = await window.anchor.perfApply(t.id, on);
        if (!r.ok) invalidate("perf:tweaks"); // page may be closed: re-read the truth next visit
        return r;
      },
    ).then((r) => { if (!r?.ok) setApplied(!on); });
  }

  function applyRecommended() {
    runTask(
      "perf:recommended",
      {
        label: "Recommended tweaks",
        where: PERF_WHERE,
        group: "perf",
        isError: (r: Array<{ id: string; ok: boolean }>) =>
          r.length > 0 && r.every((x) => !x.ok) ? "None of the tweaks could be applied" : null,
        summarize: (r) => countSummary("Applied", r.filter((x) => x.ok).length, r.length, "tweak"),
      },
      async () => {
        // each tweak saves the settings it replaces, so Revert all restores exactly those
        const r = await window.anchor.perfApplyRecommended();
        await load(true);
        return r;
      },
    );
  }

  function revertAll() {
    type Rev = Array<{ name: string; ok: boolean; error: string }>;
    runTask(
      "perf:revert",
      {
        label: "Revert tweaks",
        where: PERF_WHERE,
        group: "perf",
        isError: (r: Rev) => {
          const bad = r.filter((x) => !x.ok);
          return bad.length ? `Couldn't revert: ${bad.map((x) => x.name).join(", ")}` : null;
        },
        summarize: (r) => (r.length ? `Reverted ${r.length} setting${r.length === 1 ? "" : "s"}` : "Nothing to revert"),
      },
      async () => {
        const r = await window.anchor.perfRevertAll();
        await load(true);
        return r;
      },
    );
  }

  function clearShaders() {
    runTask(
      "perf:shaders",
      {
        label: "Shader cache clear",
        where: PERF_WHERE,
        summarize: (r: { bytes: number; cleared: string[] }) =>
          r.cleared.length ? `Cleared ${formatBytes(r.bytes)}` : "No shader caches found",
      },
      () => window.anchor.clearShaderCaches(),
    );
  }

  const latestOne = (recTask?.finishedAt ?? 0) >= (revTask?.finishedAt ?? 0) ? recTask : revTask;
  const msg = recBusy
    ? "Applying recommended tweaks…"
    : revBusy
    ? "Putting your original settings back…"
    : latestOne?.status === "error"
    ? `${latestOne.label} failed: ${latestOne.error}`
    : latestOne?.status === "done"
    ? latestOne === recTask
      ? "Recommended tweaks applied. Your previous settings are saved; Revert all puts them back."
      : "Your original settings are back."
    : "";
  const cacheMsg = shaderBusy
    ? "Clearing shader caches…"
    : shaderTask?.status === "error"
    ? `Couldn't clear shader caches: ${shaderTask.error}`
    : shaderTask?.result
    ? shaderTask.result.cleared.length
      ? `Cleared ${formatBytes(shaderTask.result.bytes)} from ${shaderTask.result.cleared.join(", ")}. Games rebuild these on next launch.`
      : "No shader caches found to clear."
    : "";

  async function addGame() {
    const exe = await window.anchor.pickExe();
    if (!exe) return;
    await window.anchor.setGpuPref(exe, true);
    setGpu(await window.anchor.gpuPrefs());
  }

  async function changePlan(guid: string) {
    setPlanMsg("");
    const r = await window.anchor.setPowerPlan(guid);
    if (!r.ok) setPlanMsg(`Couldn't switch plan: ${r.error}`);
    setPower(await window.anchor.powerPlan());
  }
  async function unlockUltimate() {
    const r = await window.anchor.addUltimatePlan();
    setPlanMsg(r.ok ? "Ultimate Performance added — choose it from the list." : `Couldn't add it: ${r.error}`);
    setPower(await window.anchor.powerPlan());
  }
  async function removeDuplicates() {
    const r = await window.anchor.removeDuplicateUltimate();
    setPlanMsg(r.ok ? `Removed ${r.removed} duplicate plan${r.removed === 1 ? "" : "s"}.` : `Couldn't remove them: ${r.error}`);
    setPower(await window.anchor.powerPlan());
  }

  const byCategory = (tweaks ?? []).filter((t) => !t.hidden).reduce<Record<string, Tweak[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="page-column space-y-6 py-6">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> One click
          </CardTitle>
          <CardDescription>
            Applies the tweaks marked Recommended. Each one saves the settings it replaces first, so Revert all puts back
            exactly what you had, including your power plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="space-y-1">
              <Button onClick={applyRecommended} loading={recBusy} disabled={!!recBlocked} title={recBlocked}>
                {!recBusy && <Zap />} Apply recommended
              </Button>
              {recBlocked && <p className="text-xs text-muted-foreground">{recBlocked}</p>}
            </div>
            <div className="space-y-1">
              <Button variant="outline" onClick={revertAll} loading={revBusy} disabled={!!revBlocked} title={revBlocked}>
                {!revBusy && <RotateCcw />} Revert all
              </Button>
              {revBlocked && <p className="text-xs text-muted-foreground">{revBlocked}</p>}
            </div>
          </div>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          {restartNeeded && (
            <Alert variant="warning">Restart your PC to finish changing hardware-accelerated GPU scheduling.</Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" /> Your graphics hardware
          </CardTitle>
          <CardDescription>
            Read-only. Outdated drivers are the most common cause of games getting slower over time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {gpus.length === 0 ? (
            <Skeleton className="h-[136px] w-full" />
          ) : (
            gpus.map((g) => <GpuCard key={g.name} gpu={g} />)
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              loading={shaderBusy}
              onClick={clearShaders}
            >
              <Eraser /> Clear shader caches
            </Button>
            {cacheMsg && <span className="text-xs text-muted-foreground">{cacheMsg}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Stale caches after a driver update are a common cause of stutter. Deleting them is safe — the first launch
            of each game is slightly slower while they rebuild.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorPlay className="size-4 text-primary" /> Power plan
          </CardTitle>
          <CardDescription>
            Balanced throttles the CPU to save power. High performance keeps clocks up — best while gaming, at the cost
            of battery life on a laptop.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!power ? (
            <Skeleton className="h-9 w-72" />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select className="w-72" value={power.active} onChange={(e) => changePlan(e.target.value)}>
                {power.plans.map((p) => (
                  <option key={p.guid} value={p.guid}>{p.name}</option>
                ))}
              </Select>
              {power.ultimateCopies === 0 && (
                <Button variant="outline" size="sm" onClick={unlockUltimate}>
                  <Plus /> Unlock Ultimate Performance
                </Button>
              )}
              {power.ultimateCopies > 1 && (
                <Button variant="outline" size="sm" onClick={removeDuplicates}>
                  <Trash2 /> Remove {power.ultimateCopies - 1} duplicate Ultimate plan{power.ultimateCopies === 2 ? "" : "s"}
                </Button>
              )}
            </div>
          )}
          {planMsg && <p className="text-xs text-muted-foreground">{planMsg}</p>}

          <div className="flex items-start gap-4 glass cut-corner rounded-lg p-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">Maximum PCIe link speed</p>
              <p className="text-xs text-muted-foreground">
                Stops Windows putting the graphics card's PCIe link into a power-saving state, which can cause small
                hitches when a game suddenly needs it. Only changes the plugged-in setting, so battery life is
                unaffected. Applies to the active power plan. Uses powercfg SUB_PCIEXPRESS (ASPM = Off).
              </p>
            </div>
            <Switch
              checked={pcieSaving === false}
              onCheckedChange={async (v) => {
                setPcieSaving(!v);
                await window.anchor.setPcie(!v);
                setPcieSaving((await window.anchor.pcieState()).saving);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {Object.entries(byCategory).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle>{cat}</CardTitle>
            {CATEGORY_NOTE[cat] && <CardDescription>{CATEGORY_NOTE[cat]}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((t) => (
              <div key={t.id} className="flex items-start gap-4 glass cut-corner rounded-lg p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.name}
                    <Badge variant={EFFECT[t.effect].variant}>{EFFECT[t.effect].label}</Badge>
                    {t.recommended && <Badge variant="success">Recommended</Badge>}
                    {t.needsRestart && <Badge variant="warning">Needs restart</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                  {blockedBy(`perf:${t.id}`) && <p className="text-xs text-muted-foreground">{blockedBy(`perf:${t.id}`)}</p>}
                </div>
                <Switch checked={t.applied} disabled={!!blocker} title={blockedBy(`perf:${t.id}`)} onCheckedChange={(v) => toggle(t, v)} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {tweaks === null && <Skeleton className="h-40 w-full" />}

      {/* only matters with two GPUs (laptops): one GPU means there's nothing to choose */}
      {gpus.length !== 1 && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="size-4 text-primary" /> Per-game GPU preference
          </CardTitle>
          <CardDescription>
            On laptops with two GPUs, Windows sometimes runs a game on the power-saving chip. Add the game's .exe to
            force the high-performance GPU.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={addGame}>
            <Plus /> Add a game or app
          </Button>
          {gpu.length > 0 && (
            <div className="space-y-1.5">
              {gpu.map((g) => (
                <div key={g.path} className="flex items-center gap-3 glass cut-corner rounded-lg p-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{g.path}</span>
                  <Badge variant="success">High performance</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      await window.anchor.setGpuPref(g.path, false);
                      setGpu(await window.anchor.gpuPrefs());
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  );
}
