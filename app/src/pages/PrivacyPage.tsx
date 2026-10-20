import { useEffect, useState } from "react";
import { Button, Card, CardContent, Skeleton, Switch } from "@/components/ui";
import { ensureRestorePoint, peek, remember } from "@/lib/store";
import { Q } from "@/lib/queries";

type Tweak = { id: string; name: string; desc: string; applied: boolean };

export default function PrivacyPage() {
  const [tweaks, setTweaks] = useState<Tweak[] | null>(peek<Tweak[]>("privacy") ?? null);
  const [restoreMsg, setRestoreMsg] = useState("");

  useEffect(() => { Q.privacy().then(setTweaks, () => {}); }, []);
  useEffect(() => { if (tweaks) remember("privacy", tweaks); }, [tweaks]);

  async function apply(t: Tweak, on: boolean) {
    setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied: on } : x)) ?? null);
    // registry change — worth a restore point, but at most once a week
    ensureRestorePoint("Anchor privacy changes").then((rp) => {
      if (!rp.skipped && rp.ok) setRestoreMsg("Restore point created before this change.");
    });
    const r = await window.anchor.privacyApply(t.id, on);
    if (!r.ok) setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied: !on } : x)) ?? null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setRestoreMsg("Creating restore point…");
            const r = await window.anchor.createRestorePoint("Anchor privacy changes");
            setRestoreMsg(r.message);
          }}
        >
          Create restore point
        </Button>
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
                  <Switch checked={t.applied} onCheckedChange={(v) => apply(t, v)} />
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
