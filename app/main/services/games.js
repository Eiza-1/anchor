// Game data for Home: upcoming releases (RAWG) and free giveaways (GamerPower).
// No Electron imports so it can be unit-tested.
const UA = { "User-Agent": "Anchor/1.0 (Windows optimization app; open-source)" };
const PLATFORM_MAP = { pc: "pc", playstation: "playstation", xbox: "xbox", nintendo: "switch" };

function mapRawg(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  return results
    .filter((r) => r && r.released)
    .map((r) => {
      const platforms = [];
      for (const p of r.parent_platforms ?? []) {
        const mapped = PLATFORM_MAP[p?.platform?.slug];
        if (mapped && !platforms.includes(mapped)) platforms.push(mapped);
      }
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        released: r.released,
        image: r.background_image ?? null,
        platforms,
        genres: (r.genres ?? []).map((g) => g.name),
        added: r.added ?? 0,
        url: `https://rawg.io/games/${r.slug}`,
      };
    })
    .sort((a, b) => (a.released < b.released ? -1 : a.released > b.released ? 1 : b.added - a.added));
}

function storeOf(platforms) {
  const p = String(platforms ?? "");
  if (/Steam/.test(p)) return "steam";
  if (/Epic Games Store/.test(p)) return "epic";
  if (/GOG/.test(p)) return "gog";
  return null;
}

function mapGamerPower(json) {
  if (!Array.isArray(json)) return [];
  const out = [];
  for (const g of json) {
    const store = storeOf(g?.platforms);
    if (!store) continue;
    const title = String(g.title ?? "")
      .replace(/\s*\((Steam|Epic Games|GOG)\)\s*Giveaway$/i, "")
      .replace(/ Giveaway$/, "")
      .trim();
    const end = String(g.end_date ?? "").trim();
    const worth = String(g.worth ?? "").trim();
    out.push({
      id: g.id,
      title,
      image: g.image,
      store,
      endDate: !end || end === "N/A" ? null : end.slice(0, 10),
      worth: !worth || worth === "N/A" ? null : worth,
      url: g.open_giveaway_url,
    });
  }
  return out;
}

/** Calendar-date arithmetic on YYYY-MM-DD, independent of timezone/DST. */
function addDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function upcomingReleases(key, today, days = 45) {
  if (!key) return { ok: false, reason: "no-key" };
  try {
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&dates=${today},${addDays(today, days)}&ordering=-added&page_size=40`;
    return { ok: true, items: mapRawg(await getJson(url)) };
  } catch {
    return { ok: false, reason: "network" };
  }
}

async function freeGames() {
  try {
    const json = await getJson("https://www.gamerpower.com/api/filter?platform=steam.epic-games-store.gog&type=game");
    return { ok: true, items: mapGamerPower(json) };
  } catch {
    return { ok: false, reason: "network" };
  }
}

module.exports = { mapRawg, mapGamerPower, upcomingReleases, freeGames };
