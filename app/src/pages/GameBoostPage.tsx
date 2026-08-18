import { useEffect, useState } from "react";
import { Cpu, Eraser, Gamepad2, MonitorPlay, Plus, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Select, Skeleton, Switch,
} from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import { cached, invalidate, peek } from "@/lib/store";

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
  const [pcieSaving, setPcieSaving] = useState<boolean | null>(null);
  const [cacheMsg, setCacheMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load(force = false) {
    if (force) invalidate("perf:tweaks", "perf:power", "perf:gpuPrefs", "perf:gpuInfo", "perf:pcie");
    const [t, p, g, info, pcie] = await Promise.all([
      cached("perf:tweaks", 15_000, () => window.anchor.perfList()),
      cached("perf:power", 15_000, () => window.anchor.powerPlan()),
      cached("perf:gpuPrefs", 15_000, () => window.anchor.gpuPrefs()),
      cached("perf:gpuInfo", 300_000, () => window.anchor.gpuInfo()),
      cached("perf:pcie", 15_000, () => window.anchor.pcieState()),
    ]);
    setTweaks(t); setPower(p); setGpu(g); setGpus(info); setPcieSaving(pcie.saving);
  }
  useEffect(() => { load(); }, []);

  const restartNeeded = tweaks?.some((t) => t.needsRestart && t.applied);

  async function toggle(t: Tweak, on: boolean) {
    setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied: on } : x)) ?? null);
    const r = await window.anchor.perfApply(t.id, on);
    if (!r.ok) setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied: !on } : x)) ?? null);
  }

  async function applyRecommended() {
    setBusy(true);
    setMsg("Creating restore point…");
    await window.anchor.createRestorePoint("Anchor performance tweaks");
    setMsg("Applying recommended tweaks…");
    await window.anchor.perfApplyRecommended();
    await load(true);
    setMsg("Recommended tweaks applied. Every one can be switched back off below.");
    setBusy(false);
  }

  async function revertAll() {
    setBusy(true);
    setMsg("Restoring Windows defaults…");
    for (const t of tweaks ?? []) if (t.applied) await window.anchor.perfApply(t.id, false);
    await load(true);
    setMsg("All tweaks reverted to Windows defaults.");
    setBusy(false);
  }

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
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Game & App Boost</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Windows settings that free up resources for games and heavy apps. Each toggle names the exact registry value
          it changes, and every one is reversible here. None of these weaken your PC's security.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-sky-500" /> One click
          </CardTitle>
          <CardDescription>
            Applies the recommended set (everything except the one needing a restart), after creating a System Restore
            point.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={applyRecommended} loading={busy}>
              {!busy && <Zap />} Apply recommended
            </Button>
            <Button variant="outline" onClick={revertAll} disabled={busy}>
              <RotateCcw /> Revert all
            </Button>
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
            <Cpu className="size-4 text-sky-500" /> Your graphics hardware
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
                <div key={g.name} className="rounded-lg border p-3">
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
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setCacheMsg("Clearing shader caches…");
                const r = await window.anchor.clearShaderCaches();
                setCacheMsg(
                  r.cleared.length
                    ? `Cleared ${formatBytes(r.bytes)} from ${r.cleared.join(", ")}. Games rebuild these on next launch.`
                    : "No shader caches found to clear."
                );
                setBusy(false);
              }}
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
            <MonitorPlay className="size-4 text-sky-500" /> Power plan
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

          <div className="flex items-start gap-4 rounded-lg border p-3">
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
              <div key={t.id} className="flex items-start gap-4 rounded-lg border p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.name}
                    {t.recommended && <Badge variant="secondary">Recommended</Badge>}
                    {t.needsRestart && <Badge variant="warning">Needs restart</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
                <Switch checked={t.applied} onCheckedChange={(v) => toggle(t, v)} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {tweaks === null && <Skeleton className="h-40 w-full" />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="size-4 text-sky-500" /> Per-game GPU preference
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
                <div key={g.path} className="flex items-center gap-3 rounded-md border p-2.5">
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
