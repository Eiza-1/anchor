import { useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Label } from "@/components/ui";

const TOOLS = [
  { label: "Disk Cleanup", cmd: "cleanmgr.exe" },
  { label: "Storage Sense", cmd: "ms-settings:storagesense" },
  { label: "Task Scheduler", cmd: "taskschd.msc" },
  { label: "System Restore", cmd: "rstrui.exe" },
  { label: "Resource Monitor", cmd: "resmon.exe" },
  { label: "Optimize Drives", cmd: "dfrgui.exe" },
];

export default function ToolsPage() {
  const [o, setO] = useState({
    userName: "User",
    computerName: "ANCHOR-PC",
    locale: "en-US",
    timeZone: "UTC",
    skipPrivacyQuestions: true,
    disableTelemetry: true,
    localAccountOnly: true,
    bypassHardwareChecks: false,
  });
  const [msg, setMsg] = useState("");

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <h1 className="text-3xl font-semibold tracking-tight">Advanced Tools</h1>

      <Card>
        <CardHeader>
          <CardTitle>Built-in Windows tools</CardTitle>
          <CardDescription>
            Direct access to Microsoft's own reliable maintenance tools — often the best option.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <Button key={t.cmd} variant="outline" size="sm" onClick={() => window.anchor.openTool(t.cmd)}>
              {t.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autounattend.xml generator</CardTitle>
          <CardDescription>
            Generates an unattended-setup file to replicate an Anchor-tuned Windows install across multiple PCs. Put the
            generated file on the root of your install USB. Review the XML before use — it is plain text by design.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="User name" value={o.userName} onChange={(v) => setO({ ...o, userName: v })} />
            <Field label="Computer name" value={o.computerName} onChange={(v) => setO({ ...o, computerName: v })} />
            <Field label="Locale" value={o.locale} onChange={(v) => setO({ ...o, locale: v })} />
            <Field
              label="Time zone (e.g. W. Central Africa Standard Time)"
              value={o.timeZone}
              onChange={(v) => setO({ ...o, timeZone: v })}
            />
          </div>

          <div className="space-y-3">
            <Check label="Skip OOBE privacy questions (applies most-private answers)"
                   checked={o.skipPrivacyQuestions} onChange={(v) => setO({ ...o, skipPrivacyQuestions: v })} />
            <Check label="Disable telemetry on first login"
                   checked={o.disableTelemetry} onChange={(v) => setO({ ...o, disableTelemetry: v })} />
            <Check label="Local account setup (skip Microsoft account requirement)"
                   checked={o.localAccountOnly} onChange={(v) => setO({ ...o, localAccountOnly: v })} />
            <Check label="Bypass TPM / Secure Boot / RAM checks (unsupported hardware installs)"
                   checked={o.bypassHardwareChecks} onChange={(v) => setO({ ...o, bypassHardwareChecks: v })} />
          </div>

          <Button
            onClick={async () => {
              const r = await window.anchor.saveAutounattend(o);
              setMsg(r.message);
            }}
          >
            Generate Autounattend.xml
          </Button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <Label>{label}</Label>
    </div>
  );
}
