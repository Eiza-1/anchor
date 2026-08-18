# Supabase Auth setup

Anchor signs users in through [Supabase Auth](https://supabase.com) using OAuth 2.0 +
PKCE in the user's default browser. One Supabase project gives you Google, GitHub,
Microsoft, Discord (and more) without registering Anchor with each provider's console
separately — though each provider still needs its own credentials pasted into Supabase.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) → **New project** → name it `Anchor`.
2. Wait for provisioning (~2 min).

## 2. Get your keys

**Settings → API**:

- **Project URL** — `https://<project-ref>.supabase.co`
- **anon / public key** — the long `eyJ…` string

Both are safe to commit: the anon key is designed to be public (it's what every
Supabase-powered web page ships in its JavaScript). Never use the **service_role** key
in the app — that one is a real secret.

Paste them into `app/main/services/auth.js`:

```js
const SUPABASE_URL = "https://your-project-ref.supabase.co";
const SUPABASE_ANON_KEY = "eyJ…";
```

## 3. Allow the desktop callback

**Authentication → URL Configuration → Redirect URLs** → add exactly:

```
http://127.0.0.1:53682/callback
```

Supabase refuses to redirect anywhere not on this list, so this step is required.

## 4. Enable providers

**Authentication → Providers**. Turn on the ones you want. Each needs a Client ID and
Secret from that provider's developer console, and the callback URL Supabase shows you
(`https://<project-ref>.supabase.co/auth/v1/callback`) registered on their side:

| Provider | Where to register |
|---|---|
| Google | [Google Cloud Console](https://console.cloud.google.com) → OAuth client (Web application) |
| GitHub | [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App |
| Microsoft (azure) | [Azure Portal](https://portal.azure.com) → App registrations |
| Discord | [Discord Developer Portal](https://discord.com/developers/applications) |

The provider buttons Anchor shows come from `PROVIDERS` in `app/main/services/auth.js` —
trim that list to the ones you actually enabled.

## 5. Email one-time codes (sign-in without a social account)

Anchor's Account page can email a 6-digit code instead of using a provider. Supabase's
default email template sends a *magic link*, which is useless in a desktop app, so add the
code to the template:

1. **Authentication → Emails → Magic Link** template.
2. Include the token somewhere in the body, e.g.:
   ```html
   <h2>Your Anchor sign-in code</h2>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   <p>Enter this code in Anchor. It expires in one hour.</p>
   ```
3. Save.

**Before releasing:** Supabase's built-in mail sender is rate-limited (a handful of emails
per hour) and intended for testing only. Under **Authentication → Emails → SMTP Settings**,
plug in a transactional provider — [Resend](https://resend.com) and
[Brevo](https://www.brevo.com) both have free tiers — or email sign-in will silently fail
for most users.

## How the flow works

1. Anchor generates a PKCE verifier + challenge and starts a one-shot listener on
   `127.0.0.1:53682` (loopback only — nothing is exposed to the network).
2. The default browser opens `\<project\>/auth/v1/authorize?provider=…`, which forwards to
   the provider's own sign-in page. Anchor never sees the password.
3. The provider returns to Supabase, which redirects the browser to the loopback address
   with a one-time code. Anchor exchanges it (with the PKCE verifier, no secret) at
   `/auth/v1/token?grant_type=pkce` and reads name + email from the returned user.
4. Name and email are saved to the local profile (`%APPDATA%\Anchor\profile.json`).
   No tokens are stored; nothing else is collected.

## Notes

- Unlike Clerk, Supabase has no hosted "account portal" page — the user picks a provider
  in Anchor and goes straight to that provider. Fewer moving parts, nothing to 404.
- Mail updates (the toggles on the Account page) still need a separate mail backend;
  Supabase handles who the user is, not sending newsletters. Supabase Edge Functions +
  any transactional mail provider is a natural fit when you get there.
