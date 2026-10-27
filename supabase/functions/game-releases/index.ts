// supabase/functions/game-releases/index.ts
// deno-lint-ignore-file no-explicit-any
// Proxies RAWG's upcoming-releases list so the RAWG key lives only here (as the
// RAWG_KEY secret) and never ships inside the Anchor app.
// The gateway still checks a JWT; the app sends the public anon key.

const TTL_MS = 6 * 60 * 60 * 1000; // RAWG data barely moves; 6 h keeps us far under quota
const WINDOW_DAYS = 45;

let cache: { at: number; body: string } | null = null;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// RAWG echoes the request query (including key=<RAWG_KEY>) in `next`/`previous`,
// so never pass its body through: keep only the fields the app's mapRawg reads.
const strip = (json: any) => ({
  results: (Array.isArray(json?.results) ? json.results : []).map((r: any) => ({
    id: r?.id,
    name: r?.name,
    slug: r?.slug,
    released: r?.released,
    background_image: r?.background_image ?? null,
    parent_platforms: (r?.parent_platforms ?? []).map((p: any) => ({ platform: { slug: p?.platform?.slug } })),
    genres: (r?.genres ?? []).map((g: any) => ({ name: g?.name })),
    added: r?.added ?? 0,
  })),
});

const headers = {
  "content-type": "application/json",
  "cache-control": "public, max-age=21600",
};

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers: { allow: "GET" } });

  if (cache && Date.now() - cache.at < TTL_MS) return new Response(cache.body, { headers });

  const key = Deno.env.get("RAWG_KEY");
  if (!key) return Response.json({ error: "RAWG_KEY is not set" }, { status: 502 });

  const today = new Date();
  const end = new Date(today.getTime() + WINDOW_DAYS * 86_400_000);
  const url = new URL("https://api.rawg.io/api/games");
  url.searchParams.set("key", key);
  url.searchParams.set("dates", `${ymd(today)},${ymd(end)}`);
  url.searchParams.set("ordering", "-added");
  url.searchParams.set("page_size", "40");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return Response.json({ error: `RAWG returned ${res.status}` }, { status: 502 });
    const body = JSON.stringify(strip(await res.json()));
    cache = { at: Date.now(), body };
    return new Response(body, { headers });
  } catch {
    return Response.json({ error: "RAWG request failed" }, { status: 502 });
  }
});
