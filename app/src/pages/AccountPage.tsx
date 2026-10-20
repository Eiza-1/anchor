import { useEffect, useState } from "react";
import { LogIn, LogOut, Mail, Pencil, ShieldCheck, UserRound } from "lucide-react";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, PageTitle, Select, Switch,
} from "@/components/ui";
import { ImageIcon, Palette, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTheme, peek, runRestorePoint, THEMES } from "@/lib/store";
import { refreshBackground, useBackground } from "@/lib/background";
import { useBlockedBy, useTask } from "@/lib/tasks";
import { Q } from "@/lib/queries";
import { setReduceMotion, useReduceMotion } from "@/lib/motion";
import { displayNameOf, greetingFor } from "@/lib/utils";
import type { Profile } from "@/types";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  azure: "Microsoft",
  discord: "Discord",
  apple: "Apple",
  facebook: "Facebook",
};

export default function AccountPage() {
  const [p, setP] = useState<Profile | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [authMsg, setAuthMsg] = useState("");
  const [signingIn, setSigningIn] = useState<string | null>(null);

  const [nameDraft, setNameDraft] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [mailMsg, setMailMsg] = useState("");

  // email one-time code
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busyEmail, setBusyEmail] = useState(false);

  useEffect(() => {
    window.anchor.loadProfile().then((prof) => {
      setP(prof);
      setNameDraft(prof.displayName ?? "");
    });
    window.anchor.authProviders().then(setProviders);
  }, []);

  if (!p) return null;

  const signedIn = p.provider !== "Local" && !!p.email;

  const greeting = displayNameOf(p) ? greetingFor(p) : "Account";

  async function persist(patch: Partial<Profile>) {
    const saved = await window.anchor.saveProfile({ ...p!, ...patch });
    setP(saved);
    return saved;
  }

  /** Saves locally and pushes to the mailing list, so the two never drift apart. */
  async function saveMailPref(patch: Partial<Profile>) {
    const saved = await persist(patch);
    setMailMsg("Saving…");
    const r = await window.anchor.saveSubscription(saved);
    setMailMsg(
      r.ok
        ? "Preferences saved."
        : "Saved on this PC, but couldn't reach the mail service — it'll sync next time you sign in."
    );
  }

  async function saveName() {
    const chosen = nameDraft.trim();
    await persist({ displayName: chosen });
    setNameMsg(chosen ? `Anchor will call you ${chosen}.` : "Using the name from your account.");
  }

  async function signInWith(provider: string) {
    setSigningIn(provider);
    setAuthMsg("Waiting for you to finish signing in in your browser…");
    const r = await window.anchor.signIn(provider);
    if (r.ok && r.user) {
      await persist({
        name: r.user.name, email: r.user.email, provider,
        userId: r.user.userId, accessToken: r.user.accessToken,
      });
      setAuthMsg("");
    } else {
      setAuthMsg(r.error ?? "Sign-in failed.");
    }
    setSigningIn(null);
  }

  async function sendCode() {
    setBusyEmail(true);
    setAuthMsg("");
    const r = await window.anchor.sendEmailCode(email.trim());
    if (r.ok) {
      setCodeSent(true);
      setAuthMsg(`We emailed a sign-in code to ${email.trim()}. It expires in about an hour.`);
    } else {
      setAuthMsg(r.error ?? "Could not send the code.");
    }
    setBusyEmail(false);
  }

  async function verifyCode() {
    setBusyEmail(true);
    const r = await window.anchor.verifyEmailCode(email.trim(), code);
    if (r.ok && r.user) {
      await persist({
        name: r.user.name, email: r.user.email, provider: "email",
        userId: r.user.userId, accessToken: r.user.accessToken,
      });
      setAuthMsg("");
      setCode("");
      setCodeSent(false);
    } else {
      setAuthMsg(r.error ?? "That code wasn't accepted.");
    }
    setBusyEmail(false);
  }

  async function signOut() {
    await window.anchor.deleteSubscription().catch(() => {});
    await persist({ provider: "Local", name: "", email: "", userId: "", accessToken: "" });
    setAuthMsg("Signed out.");
    setCodeSent(false);
    setEmail("");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <PageTitle>{greeting}</PageTitle>

      {signedIn ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-4 text-primary" /> Signed in
              </CardTitle>
              <CardDescription>
                Your details are stored only on this PC and used for greetings and the mail preferences below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">{p.email}</p>
                <p className="text-xs text-muted-foreground">
                  via {PROVIDER_LABELS[p.provider] ?? p.provider}
                </p>
              </div>
              <Button variant="outline" onClick={signOut}>
                <LogOut /> Sign out
              </Button>
              {authMsg && <p className="text-sm text-muted-foreground">{authMsg}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil className="size-4 text-primary" /> What should Anchor call you?
              </CardTitle>
              <CardDescription>
                {p.displayName
                  ? "Change this any time — it's only used to greet you."
                  : `We're using "${p.name}" from your ${PROVIDER_LABELS[p.provider] ?? p.provider} account. Pick something else if you'd rather.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1 space-y-1.5">
                  <Label>Display name</Label>
                  <Input
                    value={nameDraft}
                    maxLength={40}
                    placeholder={p.name || "Your name"}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
                  />
                </div>
                <Button onClick={saveName} disabled={nameDraft.trim() === (p.displayName ?? "")}>
                  Save
                </Button>
                {p.displayName && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const saved = await persist({ displayName: "" });
                      setNameDraft("");
                      setNameMsg(`Back to "${saved.name}" from your account.`);
                    }}
                  >
                    Use account name
                  </Button>
                )}
              </div>
              {nameMsg && <p className="text-sm text-muted-foreground">{nameMsg}</p>}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>
                Sign-in opens your default browser (powered by Supabase). Anchor never sees your
                password; it only receives your name and email, which stay on this PC.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {providers.map((prov) => (
                  <Button
                    key={prov}
                    variant="outline"
                    onClick={() => signInWith(prov)}
                    loading={signingIn === prov}
                    disabled={signingIn !== null}
                  >
                    {signingIn !== prov && <LogIn />} {PROVIDER_LABELS[prov] ?? prov}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-4 text-primary" /> Or use your email
              </CardTitle>
              <CardDescription>
                No account with those services? We'll email you a one-time code — no password to
                create or remember.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1 space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    placeholder="you@example.com"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={sendCode}
                  loading={busyEmail && !codeSent}
                  disabled={!email.includes("@") || busyEmail}
                >
                  {codeSent ? "Resend code" : "Send code"}
                </Button>
              </div>

              {codeSent && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-40 space-y-1.5">
                    <Label>Sign-in code</Label>
                    <Input
                      value={code}
                      placeholder="123456"
                      inputMode="numeric"
                      maxLength={8}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  <Button onClick={verifyCode} loading={busyEmail} disabled={code.length < 6}>
                    Verify & sign in
                  </Button>
                </div>
              )}

              {authMsg && <p className="text-sm text-muted-foreground">{authMsg}</p>}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-4 text-primary" /> Appearance
          </CardTitle>
          <CardDescription>
            Dark is the default. Pick whichever is easiest on your eyes. Each theme comes with its own background picture, or use one of yours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={async () => {
                  applyTheme(t.id);
                  await persist({ theme: t.id });
                }}
                className={cn(
                  "glass cut-corner rounded-lg flex items-center gap-3 p-3 text-left transition-[transform,background-color,box-shadow] duration-spring ease-spring hover:-translate-y-px hover:bg-accent/70",
                  (p.theme ?? "dark") === t.id && "shadow-[inset_0_0_0_1.5px_hsl(var(--primary)),0_0_18px_-4px_hsl(var(--primary)/0.6)]"
                )}
              >
                <span className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/15">
                  {t.swatch.map((c) => (
                    <span key={c} className="size-4" style={{ background: c }} />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <BackgroundPicker />
          <ReduceMotionToggle />
        </CardContent>
      </Card>

      <RestorePoints initialPolicy={p.restorePolicy ?? "weekly"} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4 text-primary" /> Email updates
          </CardTitle>
          <CardDescription>
            {signedIn
              ? `Sent to ${p.email}. Change these any time — unticking everything stops all mail, and signing out removes you from the lists entirely.`
              : "Sign in above to subscribe. Anchor needs a confirmed email address before it can send you anything."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            label="Windows update stability alerts"
            hint="When a Windows update is causing widespread problems, or a fix arrives"
            disabled={!signedIn}
            checked={p.mailWindowsUpdates}
            onChange={(v) => saveMailPref({ mailWindowsUpdates: v })}
          />
          <Toggle
            label="System health reminders"
            hint="Occasional nudges to check drive health and run a health check"
            disabled={!signedIn}
            checked={p.mailSystemHealth}
            onChange={(v) => saveMailPref({ mailSystemHealth: v })}
          />
          <Toggle
            label="Tech news digest"
            hint="A weekly roundup from the sources in Tech Spotlight"
            disabled={!signedIn}
            checked={p.mailTechNews}
            onChange={(v) => saveMailPref({ mailTechNews: v })}
          />
          <Toggle
            label="Anchor releases"
            hint="What's new in each version, and what's coming"
            disabled={!signedIn}
            checked={p.mailAnchorUpdates}
            onChange={(v) => saveMailPref({ mailAnchorUpdates: v })}
          />
          {mailMsg && <p className="text-sm text-muted-foreground">{mailMsg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({
  label, hint, checked, onChange, disabled,
}: {
  label: string; hint?: string; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", disabled && "opacity-50")}>
      <div className="min-w-0">
        <Label>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Off by default: Anchor animates even when Windows' "Animation effects" is off. */
function ReduceMotionToggle() {
  const on = useReduceMotion();
  return (
    <Toggle
      label="Reduce animations"
      hint="Turns off Anchor's springs, slides and pulses. Anchor ignores Windows' animation setting, so use this instead."
      checked={on}
      onChange={setReduceMotion}
    />
  );
}

function describeAge(days: number) {
  if (days > 9000) return "none found";
  if (days < 1) return "earlier today";
  const d = Math.round(days);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function RestorePoints({ initialPolicy }: { initialPolicy: string }) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [last, setLast] = useState(() => {
    const l = peek<{ days: number }>("restore:last");
    return l ? describeAge(l.days) : "";
  });
  const task = useTask<{ ok: boolean; message: string }>("restore:create");
  const blocker = useBlockedBy("restore");
  const creating = task?.status === "running";
  const blockedMsg = blocker && blocker.key !== "restore:create" ? `${blocker.label} is already running` : undefined;
  const msg = creating ? "Creating restore point…" : task?.result?.message ?? task?.error ?? "";

  useEffect(() => { Q.lastRestorePoint().then((l) => setLast(describeAge(l.days)), () => {}); }, [task?.finishedAt]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-500" /> Restore points
        </CardTitle>
        <CardDescription>
          Created before changes that are hard to undo, such as removing apps or editing the registry. Windows deletes
          the oldest to make room, so Anchor doesn't make one for every change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            className="w-48"
            value={policy}
            onChange={async (e) => {
              setPolicy(e.target.value);
              await window.anchor.saveProfile({ restorePolicy: e.target.value as "weekly" | "monthly" | "always" });
            }}
          >
            <option value="weekly">At most weekly</option>
            <option value="monthly">At most monthly</option>
            <option value="always">Before every change</option>
          </Select>
          <Button
            variant="outline"
            size="sm"
            loading={creating}
            disabled={!!blockedMsg}
            title={blockedMsg}
            onClick={() => { runRestorePoint("Anchor manual restore point"); }}
          >
            Create one now
          </Button>
        </div>
        {last && <p className="text-xs text-muted-foreground">Most recent restore point: {last}</p>}
        {blockedMsg && <p className="text-xs text-muted-foreground">{blockedMsg}</p>}
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}

/** "Use my own picture…" / "Reset to theme picture", under the theme swatches. */
function BackgroundPicker() {
  const { custom } = useBackground();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick() {
    setBusy(true);
    setError("");
    try {
      const r = await window.anchor.pickBackground();
      if (r.ok) await refreshBackground();
      else if (r.message && r.message !== "Cancelled.") setError(r.message);
    } catch (e) {
      setError(`Couldn't set that picture: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError("");
    try {
      await window.anchor.resetBackground();
      await refreshBackground();
    } catch (e) {
      setError(`Couldn't reset the picture: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={pick}>
          <ImageIcon /> Use my own picture…
        </Button>
        {custom && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>
            <RotateCcw /> Reset to theme picture
          </Button>
        )}
        <span className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 15 MB.</span>
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
