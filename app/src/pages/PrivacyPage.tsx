import { useEffect, useState } from "react";
import { Button, Card, CardContent, Skeleton, Switch } from "@/components/ui";

type Tweak = { id: string; name: string; desc: string; applied: boolean };

export default function PrivacyPage() {
  const [tweaks, setTweaks] = useState<Tweak[] | null>(null);
  const [restoreMsg, setRestoreMsg] = useState("");

  useEffect(() => { window.anchor.privacyList().then(setTweaks); }, []);

  async function apply(t: Tweak, on: boolean) {
    setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied: on } : x)) ?? null);
    const r = await window.anchor.privacyApply(t.id, on);
    if (!r.ok) setTweaks((prev) => prev?.map((x) => (x.id === t.id ? { ...x, applied: !on } : x)) ?? null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy & Telemetry</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each toggle shows exactly which registry value it changes — no hidden behavior, all reversible here.
          Consider creating a restore point first.
        </p>
      </div>

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
