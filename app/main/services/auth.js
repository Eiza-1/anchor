// Sign-in via Supabase Auth using OAuth 2.0 Authorization Code + PKCE.
// The whole flow runs in the user's DEFAULT BROWSER — Anchor never embeds a web
// view and never sees the password. Public client: only the anon key is used,
// which is safe to ship (it's the same key any web page using Supabase exposes).
// Setup: see docs/SUPABASE_SETUP.md, then fill in the two constants below.
const http = require("http");
const crypto = require("crypto");
const { shell } = require("electron");

// Settings live in main/config.js, which is gitignored. Cloning the repo gives
// you config.example.js to copy — see docs/SUPABASE_SETUP.md.
let config;
try {
  config = require("../config");
} catch {
  config = require("../config.example");
}

const SUPABASE_URL = config.supabaseUrl;
const SUPABASE_ANON_KEY = config.supabaseAnonKey;

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

// Providers offered in the UI. Enable the matching ones in the Supabase dashboard.
const PROVIDERS = config.providers ?? ["google", "github"];

const isConfigured = () =>
  !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");

const b64url = (buf) =>
  buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Anchor</title>
<style>body{font-family:'Segoe UI',sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#09090b;color:#fafafa;text-align:center}</style>
</head><body><div>${body}</div></body></html>`;
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
      reject(new Error("Sign-in timed out — the browser window was never completed."));
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
  return { name, email: json.user?.email ?? "" };
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
  return { name, email: json.user?.email ?? email };
}

module.exports = { signIn, isConfigured, PROVIDERS, sendEmailCode, verifyEmailCode };
