import { useEffect, useState } from "react";
import { Cpu, Eraser, Gamepad2, MonitorPlay, Plus, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Select, Skeleton, Switch,
} from "@/components/ui";
import { countSummary, formatBytes } from "@/lib/utils";
import { ensureRestorePoint, invalidate, peek, remember } from "@/lib/store";
import { Q } from "@/lib/queries";
import { runTask, useBlockedBy, useTask } from "@/lib/tasks";

const PERF_WHERE = { section: "performance", tab: "boost" };

type Tweak = {
  id: string; name: string; desc: string; category: string;
  needsRestart: boolean; recommended: boolean; applied: boolean;
};
type PowerPlan = { active: string; plans: { guid: string; name: string }[] };
type GpuPref = { path: string; value: string };
type Gpu = {
  name: string; driver: string; driverDate: string | null;
  vram: number; ageDays: number | null; errorCode?: number;
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

  const restartNeeded = tweaks?.some((t) => t.needsRestart && t.applied);

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
        await ensureRestorePoint("Anchor performance tweaks");
        const r = await window.anchor.perfApplyRecommended();
        await load(true);
        return r;
      },
    );
  }

  function revertAll() {
    const applied = (tweaks ?? []).filter((t) => t.applied);
    runTask(
      "perf:revert",
      {
        label: "Revert tweaks",
        where: PERF_WHERE,
        group: "perf",
        isError: (r: boolean[]) => (r.some((ok) => !ok) ? `${r.filter((ok) => !ok).length} tweaks couldn't be reverted` : null),
        summarize: () => "Windows defaults restored",
      },
      async () => {
        const oks: boolean[] = [];
        for (const t of applied) oks.push((await window.anchor.perfApply(t.id, false)).ok);
        await load(true);
        return oks;
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
    ? "Checking restore point, then applying tweaks…"
    : revBusy
    ? "Restoring Windows defaults…"
    : latestOne?.status === "error"
    ? `${latestOne.label} failed: ${latestOne.error}`
    : latestOne?.status === "done"
    ? latestOne === recTask
      ? "Recommended tweaks applied. Every one can be switched back off below."
      : "All tweaks reverted to Windows defaults."
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

  const byCategory = (tweaks ?? []).reduce<Record<string, Tweak[]>>((acc, t) => {
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
            Applies the recommended set (everything except the one needing a restart), after creating a System Restore
            point.
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
            <Alert variant="warning">Restart your PC to finish applying GPU scheduling.</Alert>
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
            <Skeleton className="h-14 w-full" />
          ) : (
            gpus.map((g) => {
              const stale = g.ageDays !== null && g.ageDays > 365;
              const aging = g.ageDays !== null && g.ageDays > 180 && !stale;
              return (
                <div key={g.name} className="glass cut-corner rounded-lg p-3">
                  <p className="text-sm font-medium">{g.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Driver {g.driver}
                    {g.driverDate && ` · ${g.driverDate}`}
                    {g.vram > 0 && ` · ${formatBytes(g.vram)} VRAM`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.errorCode ? (
                      <Badge variant="destructive">
                        Not working — Device Manager code {g.errorCode}
                      </Badge>
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
                  </div>
                  {g.errorCode === 43 && (
                    <p className="mt-2 text-xs text-red-400">
                      Windows stopped this GPU because it reported problems. Games will fall back to the other adapter.
                      Reinstall the vendor driver; if the code returns, the card may need service.
                    </p>
                  )}
                </div>
              );
            })
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
              <Select
                className="w-72"
                value={power.active}
                onChange={async (e) => {
                  await window.anchor.setPowerPlan(e.target.value);
                  setPower(await window.anchor.powerPlan());
                }}
              >
                {power.plans.map((p) => (
                  <option key={p.guid} value={p.guid}>{p.name}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await window.anchor.addUltimatePlan();
                  setPower(await window.anchor.powerPlan());
                }}
              >
                <Plus /> Unlock Ultimate Performance
              </Button>
            </div>
          )}

          <div className="flex items-start gap-4 glass cut-corner rounded-lg p-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">Maximum PCIe link speed</p>
              <p className="text-xs text-muted-foreground">
                Stops Windows dropping the PCIe link to a lower power state, which can cost frames on a desktop. Applies
                to the active power plan, so switching plans puts it back. Uses powercfg SUB_PCIEXPRESS.
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
          <CardHeader><CardTitle>{cat}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {items.map((t) => (
              <div key={t.id} className="flex items-start gap-4 glass cut-corner rounded-lg p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.name}
                    {t.recommended && <Badge variant="secondary">Recommended</Badge>}
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

      <Card>
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
      </Card>
    </div>
  );
}
