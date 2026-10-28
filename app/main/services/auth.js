// Sign-in via Supabase Auth using OAuth 2.0 Authorization Code + PKCE.
// The whole flow runs in the user's DEFAULT BROWSER — Anchor never embeds a web
// view and never sees the password. Public client: only the anon key is used,
// which is safe to ship (it's the same key any web page using Supabase exposes).
// Setup: see docs/SUPABASE_SETUP.md; the settings come from services/config.js.
const http = require("http");
const crypto = require("crypto");
const { shell } = require("electron");

const { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } = require("./config");

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

const b64url = (buf) =>
  buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Anchor</title>
<style>body{font-family:'Segoe UI',sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#09090b;color:#fafafa;text-align:center}</style>
</head><body><div>${body}</div></body></html>`;
}

// Supabase token response -> the Session kept (encrypted) by services/session.js.
function toSession(json, email) {
  return {
    userId: json.user?.id ?? "",
    email,
    accessToken: json.access_token ?? "",
    refreshToken: json.refresh_token ?? "",
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  };
}

/** Trades a refresh token for a new session. null = Supabase refused it (400/401);
 *  network errors and 5xx throw, so a flaky connection never costs the user their sign-in.
 *  `prevEmail` is kept when the response carries no user, so the mail row keeps its address. */
async function refreshSession(refreshToken, prevEmail = "") {
  if (!isConfigured() || !refreshToken) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.status === 400 || res.status === 401) return null;
  if (!res.ok) throw new Error(`Refresh failed (${res.status}).`);
  const json = await res.json();
  if (!json.access_token) throw new Error("Refresh returned no token.");
  return toSession(json, json.user?.email || prevEmail);
}

async function signIn(provider = "google") {
  if (!isConfigured())
    throw new Error("Sign-in isn't configured in this build. See docs/SUPABASE_SETUP.md.");

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (!url.pathname.startsWith("/callback")) {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error_description") || url.searchParams.get("error");
      const got = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        page(
          err || !got
            ? "<h2>Sign-in failed</h2><p>You can close this tab and try again in Anchor.</p>"
            : "<h2>You're signed in ✓</h2><p>You can close this tab and return to Anchor.</p>"
        )
      );
      server.close();
      clearTimeout(timer);
      if (err) reject(new Error(`Sign-in was cancelled or failed (${err}).`));
      else if (!got) reject(new Error("No authorization code was returned."));
      else resolve(got);
    });
    server.on("error", () =>
      reject(new Error(`Could not listen on port ${PORT}. Is another sign-in already open?`))
    );
    server.listen(PORT, "127.0.0.1", () => {
      const authorizeUrl =
        `${SUPABASE_URL}/auth/v1/authorize?provider=${encodeURIComponent(provider)}` +
        `&redirect_to=${encodeURIComponent(REDIRECT_URI)}` +
        `&code_challenge=${challenge}&code_challenge_method=s256`;
      shell.openExternal(authorizeUrl);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Sign-in timed out. The browser sign-in wasn't finished."));
    }, 3 * 60 * 1000);
  });

  // Exchange the code for a session (PKCE — no client secret involved).
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Token exchange failed: ${json.error_description ?? json.msg ?? res.status}`);

  const meta = json.user?.user_metadata ?? {};
  const name =
    meta.full_name || meta.name || meta.user_name || meta.preferred_username || json.user?.email || "";
  return { name, email: json.user?.email ?? "", session: toSession(json, json.user?.email ?? "") };
}

/* ------------------------- newsletter subscription ------------------------ *
 * Preferences live in a Supabase table so the mail service can read them.
 * Row-level security ties each row to the signed-in user, so the token below
 * only ever grants access to that user's own row.                            */
async function saveSubscription({ session, prefs }) {
  const { accessToken, userId, email } = session ?? {};
  if (!isConfigured() || !accessToken || !userId) return { ok: false, error: "Not signed in." };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?on_conflict=user_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      email,
      windows_updates: !!prefs.mailWindowsUpdates,
      system_health: !!prefs.mailSystemHealth,
      tech_news: !!prefs.mailTechNews,
      anchor_updates: !!prefs.mailAnchorUpdates,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
  return { ok: true };
}

/** Removes the user from every mailing list. */
async function deleteSubscription({ session }) {
  const { accessToken, userId } = session ?? {};
  if (!accessToken || !userId) return { ok: false, error: "Not signed in." };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  return { ok: res.ok, error: res.ok ? "" : String(res.status) };
}

// ---- Email one-time code (no social account needed) ----------------------
// Supabase emails a 6-digit code; the user types it into Anchor. No password,
// no browser round-trip. Requires the "Magic Link" email template to include
// {{ .Token }} — see docs/SUPABASE_SETUP.md.

function authHeaders() {
  return { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY };
}

async function sendEmailCode(email) {
  if (!isConfigured())
    throw new Error("Sign-in isn't configured in this build. See docs/SUPABASE_SETUP.md.");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, create_user: true }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(json.error_description ?? json.msg ?? `Could not send the code (${res.status}).`);
  return true;
}

async function verifyEmailCode(email, token) {
  // First-time addresses get a "signup" token, returning users an "email" token.
  // Try both so the user never has to care which they received.
  let json = {};
  let ok = false;
  for (const type of ["email", "signup"]) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ type, email, token: token.trim() }),
    });
    json = await res.json().catch(() => ({}));
    if (res.ok) { ok = true; break; }
  }
  if (!ok)
    throw new Error(json.error_description ?? json.msg ?? "That code wasn't accepted. Try again.");
  const meta = json.user?.user_metadata ?? {};
  const name = meta.full_name || meta.name || (json.user?.email ?? "").split("@")[0] || "";
  const mail = json.user?.email ?? email;
  return { name, email: mail, session: toSession(json, mail) };
}

module.exports = {
  signIn, sendEmailCode, verifyEmailCode,
  saveSubscription, deleteSubscription, refreshSession,
};
