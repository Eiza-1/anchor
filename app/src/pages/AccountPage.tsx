import { useEffect, useState } from "react";
import { LogIn, LogOut, Mail, UserRound } from "lucide-react";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Switch,
} from "@/components/ui";
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

  // email one-time code
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busyEmail, setBusyEmail] = useState(false);

  useEffect(() => {
    window.anchor.loadProfile().then(setP);
    window.anchor.authProviders().then(setProviders);
  }, []);

  if (!p) return null;

  const signedIn = p.provider !== "Local" && !!p.email;

  const greeting = (() => {
    const h = new Date().getHours();
    const time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    return p.name ? `${time}, ${p.name}!` : "Account";
  })();

  async function persist(patch: Partial<Profile>) {
    const saved = await window.anchor.saveProfile({ ...p!, ...patch });
    setP(saved);
    return saved;
  }

  async function signInWith(provider: string) {
    setSigningIn(provider);
    setAuthMsg("Waiting for you to finish signing in in your browser…");
    const r = await window.anchor.signIn(provider);
    if (r.ok && r.user) {
      await persist({ name: r.user.name, email: r.user.email, provider });
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
      await persist({ name: r.user.name, email: r.user.email, provider: "email" });
      setAuthMsg("");
      setCode("");
      setCodeSent(false);
    } else {
      setAuthMsg(r.error ?? "That code wasn't accepted.");
    }
    setBusyEmail(false);
  }

  async function signOut() {
    await persist({ provider: "Local", name: "", email: "" });
    setAuthMsg("Signed out.");
    setCodeSent(false);
    setEmail("");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <h1 className="text-3xl font-semibold tracking-tight">{greeting}</h1>

      {signedIn ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-sky-500" /> Signed in
            </CardTitle>
            <CardDescription>
              Your name and email are stored only on this PC and used for greetings and the mail
              preferences below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              {p.name && <p className="font-medium">{p.name}</p>}
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
                <Mail className="size-4 text-sky-500" /> Or use your email
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
          <CardTitle>Email updates</CardTitle>
          <CardDescription>
            Choose what Anchor may email you about. (Requires a configured mail backend —
            preferences are stored now, mails start once the project's mail service is live.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            label="Windows update stability alerts"
            checked={p.mailWindowsUpdates}
            onChange={(v) => persist({ mailWindowsUpdates: v })}
          />
          <Toggle
            label="System health analysis feedback"
            checked={p.mailSystemHealth}
            onChange={(v) => persist({ mailSystemHealth: v })}
          />
          <Toggle
            label="Tech news digest"
            checked={p.mailTechNews}
            onChange={(v) => persist({ mailTechNews: v })}
          />
          <Toggle
            label="Exclusive Anchor updates"
            checked={p.mailAnchorUpdates}
            onChange={(v) => persist({ mailAnchorUpdates: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
