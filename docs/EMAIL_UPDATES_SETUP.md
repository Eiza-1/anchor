# Making email updates real

The app already writes each user's preferences to Supabase when they toggle them.
Two things are needed on the server side: a table to hold subscriptions, and
something that sends the mail.

## 1. Create the table

Supabase → **SQL Editor** → New query → paste and run:

```sql
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  windows_updates boolean not null default true,
  system_health   boolean not null default true,
  tech_news       boolean not null default false,
  anchor_updates  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Each person can only see and change their own row.
create policy "own row: read"   on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "own row: insert" on public.subscriptions
  for insert with check (auth.uid() = user_id);
create policy "own row: update" on public.subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row: delete" on public.subscriptions
  for delete using (auth.uid() = user_id);
```

Row-level security is what makes this safe to reach from the app with the public
anon key: the token a signed-in user holds only unlocks their own row.

## 2. Create the sending function

Supabase → **Edge Functions** → New function named `send-digest`, with this code.
It reads subscribers for one list and sends through Brevo (the same account
already sending your sign-in codes).

```ts
// supabase/functions/send-digest/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY")!;
const SENDER = { name: "Anchor", email: Deno.env.get("SENDER_EMAIL")! };

Deno.serve(async (req) => {
  // Only allow calls carrying the cron secret
  if (req.headers.get("x-anchor-secret") !== Deno.env.get("CRON_SECRET"))
    return new Response("no", { status: 401 });

  const { list, subject, html } = await req.json();
  const column = {
    windows: "windows_updates",
    health: "system_health",
    news: "tech_news",
    releases: "anchor_updates",
  }[list as string];
  if (!column) return new Response("unknown list", { status: 400 });

  // service_role key stays on the server — never in the app
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await db.from("subscriptions").select("email").eq(column, true);
  if (error) return new Response(error.message, { status: 500 });

  // Brevo accepts up to 99 recipients per call; batch them
  const emails = data.map((r) => r.email);
  const failures: string[] = [];

  for (let i = 0; i < emails.length; i += 90) {
    const batch = emails.slice(i, i + 90);
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": BREVO_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        sender: SENDER,
        to: [SENDER],                                  // real recipients stay hidden
        bcc: batch.map((e) => ({ email: e })),
        subject,
        htmlContent: html,
      }),
    });
    // Brevo explains exactly what it rejected — surface it instead of
    // reporting success for mail that never left.
    if (!res.ok) failures.push(`${res.status}: ${await res.text()}`);
  }

  return Response.json({
    subscribers: emails.length,
    sent: emails.length - failures.length * 90,
    failures,
  });
});
```

Then set its secrets (Edge Functions → send-digest → Secrets):

| Name | Value |
|---|---|
| `BREVO_API_KEY` | Brevo → SMTP & API → **API keys** (not the SMTP key) |
| `SENDER_EMAIL` | your verified Brevo sender |
| `CRON_SECRET` | any long random string you invent |

## 3. Send something

Manually, to test. Note the `Authorization` header: Supabase verifies a JWT on every
Edge Function call before your code runs, so without it you get a 401 from the
gateway even with the right cron secret. The anon key is fine here — it's public.

```powershell
$secret = "YOUR_CRON_SECRET"
$anon   = "YOUR_SUPABASE_ANON_KEY"

$body = @{
  list    = "releases"
  subject = "Anchor 0.4.0 is out"
  html    = "<h2>What's new</h2><p>…</p>"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://yynlcziuzanbhurwfdlx.supabase.co/functions/v1/send-digest" `
  -Headers @{
    "x-anchor-secret" = $secret
    "Authorization"   = "Bearer $anon"
    "content-type"    = "application/json"
  } `
  -Body $body
```

(Windows PowerShell's `curl` is an alias for `Invoke-WebRequest`, not real curl —
hence the native syntax above. `curl.exe` also works if you prefer.)

On a schedule — Supabase → **Database → Cron** (pg_cron), e.g. a weekly news digest:

```sql
select cron.schedule(
  'anchor-weekly-news',
  '0 9 * * 1',                    -- Mondays 09:00 UTC
  $$ select net.http_post(
       url := 'https://yynlcziuzanbhurwfdlx.supabase.co/functions/v1/send-digest',
       headers := '{"x-anchor-secret":"YOUR_CRON_SECRET","content-type":"application/json"}'::jsonb,
       body := '{"list":"news","subject":"This week in tech","html":"<p>…</p>"}'::jsonb
     ) $$
);
```

## Notes

- **Unsubscribing works already**: unticking a toggle updates the row, and signing
  out deletes it. Any bulk email you send should still carry an unsubscribe link —
  it's a legal requirement in most countries and Brevo adds one automatically.
- **Volume**: Brevo's free tier is 300 emails/day. A weekly digest to 300 people
  fits; beyond that, move to a paid tier or Amazon SES.
- **The Anchor releases list** is the easy win — send it when you publish a
  GitHub release, reusing the notes you already write.
