import { useEffect, useState } from "react";
import { Button, Card, CardContent, Skeleton, Switch } from "@/components/ui";
import { ensureRestorePoint, invalidate, peek, remember, runRestorePoint } from "@/lib/store";
import { runTask, useBlockedBy, useTask } from "@/lib/tasks";
import { Q } from "@/lib/queries";

type Tweak = { id: string; name: string; desc: string; applied: boolean };

export default function PrivacyPage() {
  const [tweaks, setTweaks] = useState<Tweak[] | null>(peek<Tweak[]>("privacy") ?? null);
  const [restoreNote, setRestoreNote] = useState("");
  const restoreTask = useTask<{ ok: boolean; message: string }>("restore:create");
  const blocker = useBlockedBy("change");
  const creating = restoreTask?.status === "running";
  const restoreMsg = creating ? "Creating restore point…" : restoreNote || restoreTask?.result?.message || restoreTask?.error || "";

  useEffect(() => { Q.privacy().then(setTweaks, () => {}); }, []);
  useEffect(() => { if (tweaks) remember("privacy", tweaks); }, [tweaks]);

  function apply(t: Tweak, on: boolean) {
    const setApplied = (applied: boolean) =>
      setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied } : x)) ?? null);
    setApplied(on);
    runTask(
      `privacy:${t.id}`,
      {
        label: "Privacy setting",
        where: { section: "debloat", tab: "privacy" },
        group: "change",
        isError: (r: { ok: boolean; error: string }) => (r.ok ? null : r.error || "Couldn't change this setting"),
        summarize: () => `${t.name} ${on ? "turned on" : "turned off"}`,
      },
      async () => {
        // registry change — worth a restore point, but at most once a week
        const rp = await ensureRestorePoint("Anchor privacy changes");
        if (!rp.skipped && rp.ok) setRestoreNote("Restore point created before this change.");
        const r = await window.anchor.privacyApply(t.id, on);
        // the page may be closed by now: make the next visit re-read the truth
        invalidate("privacy");
        if (!r.ok) setApplied(!on);
        return r;
      },
    ).then((r) => { if (r === undefined) setApplied(!on); });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          loading={creating}
          disabled={!!blocker}
          title={blocker ? `${blocker.label} is already running` : undefined}
          onClick={() => { setRestoreNote(""); runRestorePoint("Anchor privacy changes"); }}
        >
          Create restore point
        </Button>
        {blocker && <span className="text-xs text-muted-foreground">{blocker.label} is already running</span>}
        {restoreMsg && <span className="text-xs text-muted-foreground">{restoreMsg}</span>}
      </div>

      <div className="space-y-2">
        {tweaks === null
          ? [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          : tweaks.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                  <Switch checked={t.applied} disabled={!!blocker} onCheckedChange={(v) => apply(t, v)} />
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
