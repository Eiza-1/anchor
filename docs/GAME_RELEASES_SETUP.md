# Game release calendar (RAWG)

Home's release calendar reads from RAWG. The RAWG key used to be bundled in the
app, where anyone could extract it from `app.asar`. It now lives only as a secret
on a Supabase Edge Function, `game-releases`; the app calls that function with the
public anon key.

## 1. Create the function

Either paste `supabase/functions/game-releases/index.ts` into Supabase →
**Edge Functions** → New function named `game-releases`, or from the repo root:

```powershell
supabase functions deploy game-releases
```

Leave **Verify JWT** on (the default). The app sends the anon key, which passes.

## 2. Set the secret

Get a free key at <https://rawg.io/apidocs>, then either use Edge Functions →
Secrets, or:

```powershell
supabase secrets set RAWG_KEY=your_new_key
```

| Name | Value |
|---|---|
| `RAWG_KEY` | your RAWG API key |

## 3. Rotate the old key

Anchor 1.1.1 and earlier shipped the old RAWG key inside the app. Treat it as
public: at rawg.io, generate a new key, put the new one in the secret above, and
retire the old one.

## 4. Check it

```powershell
$anon = "YOUR_SUPABASE_ANON_KEY"
Invoke-RestMethod `
  -Uri "https://YOUR_PROJECT_REF.supabase.co/functions/v1/game-releases" `
  -Headers @{ apikey = $anon; Authorization = "Bearer $anon" }
```

You should get `{ results: [...] }`, each game trimmed to the fields Anchor
uses. Confirm the response contains no `key=` anywhere — RAWG echoes its key
in its paging links, and the function must strip them:

```powershell
(Invoke-WebRequest `
  -Uri "https://YOUR_PROJECT_REF.supabase.co/functions/v1/game-releases" `
  -Headers @{ apikey = $anon; Authorization = "Bearer $anon" }).Content -match "key="
# must print False
```

## Notes

- The function asks RAWG for games releasing from today to 45 days out (UTC),
  most-added first, 40 per page.
- Responses are cached in the function's memory for 6 hours (and sent with
  `Cache-Control: public, max-age=21600`), so RAWG sees very few requests.
- Only `GET` is accepted. If RAWG fails the function answers 502 and Home shows
  its usual "unavailable" state.
- Developing locally: copy `app/main/config.example.js` to `config.js` with your
  Supabase URL and anon key. No RAWG key is needed in the app.
