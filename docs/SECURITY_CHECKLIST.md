# Security checklist

Things only you can check, in the Supabase dashboard and before each release.
Tick them off once, then re-check after any change to auth or the Edge Functions.

## Supabase dashboard

- [ ] **RLS on `public.subscriptions`.** Table Editor → `subscriptions` shows
  "RLS enabled", and Authentication → Policies lists exactly four policies, all
  own-row: read, insert, update, delete (`auth.uid() = user_id`). The SQL is in
  [EMAIL_UPDATES_SETUP.md](EMAIL_UPDATES_SETUP.md).
- [ ] **Redirect URLs.** Authentication → URL Configuration: the redirect list is
  exactly `http://127.0.0.1:53682/callback` and nothing else. Check the Site URL
  too; it must not point at anything you don't control.
- [ ] **Email OTP rate limits.** Authentication → Rate Limits: the email OTP / sign-in
  limits are set, not left at an open-ended value.
- [ ] **OTP expiry.** Authentication → Providers → Email: OTP expiry is 3600
  seconds (1 hour) or less.
- [ ] **`send-digest` secrets.** Edge Functions → Secrets has every secret that
  [EMAIL_UPDATES_SETUP.md](EMAIL_UPDATES_SETUP.md) lists, and `CRON_SECRET` is at
  least 32 random characters (for example `openssl rand -hex 32`).
- [ ] **`game-releases` deployed** with the `RAWG_KEY` secret set. See
  [GAME_RELEASES_SETUP.md](GAME_RELEASES_SETUP.md).
- [ ] **RAWG key rotated.** The old key was bundled in earlier app builds, so treat
  it as public: create a new key at <https://rawg.io/apidocs>, set it as `RAWG_KEY`,
  and revoke the old one.
- [ ] **No `service_role` key outside Edge Function secrets.** Not in the repo,
  `app/`, `.env` files, release artifacts or the website. Only the public anon key
  may ship. If a `service_role` key was ever committed or shared, rotate it
  (Project Settings → API). Background: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Before each release

- [ ] Run `npm run release` from `app/`. It scans `dist/` and `main/` with
  `scripts/scan-artifacts.js` before packing, and electron-builder's `afterPack`
  hook (`scripts/after-pack.js`) scans each packed `resources/app.asar`, x64 and
  arm64, before any installer is made or anything is published. A secret or a
  source map stops the release; the build log shows
  `release gate  OK: no secrets or source maps in N file(s)` for each arch.
- [ ] Optional re-check of a finished build:
  `node scripts/scan-artifacts.js <path to app.asar>`. It must report no secrets.
