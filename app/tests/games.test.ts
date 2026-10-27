import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";
import { releaseCountdown, filterByPlatform, dayMonth, rawgImage, timeAgo } from "@/lib/games";
import type { GameRelease, GamesResult } from "@/types";

const require = createRequire(import.meta.url);
const games = require("../main/services/games.js") as {
  mapRawg(json: unknown): GameRelease[];
  mapGamerPower(json: unknown): { title: string; store: string; endDate: string | null; worth: string | null; url: string }[];
  upcomingReleases(cfg: { url: string; anonKey: string }, fetchFn?: unknown): Promise<GamesResult<GameRelease>>;
};

const pp = (...slugs: string[]) => slugs.map((s) => ({ platform: { slug: s } }));

describe("mapRawg", () => {
  const json = {
    results: [
      { id: 1, name: "B", slug: "mycopunk", released: "2026-11-01", background_image: "https://x/i.jpg", added: 10,
        parent_platforms: pp("pc", "playstation", "nintendo", "mac", "pc"), genres: [{ name: "Action" }] },
      { id: 2, name: "No date", slug: "nd", released: null, added: 5, parent_platforms: pp("pc"), genres: [] },
      { id: 3, name: "A", slug: "a", released: "2026-11-01", background_image: null, added: 50, parent_platforms: pp("xbox"), genres: [] },
      { id: 4, name: "C", slug: "c", released: "2026-10-25", added: 1, parent_platforms: pp("pc"), genres: [] },
    ],
  };
  const out = games.mapRawg(json);
  it("maps and de-duplicates platforms", () => {
    expect(out.find((g) => g.id === 1)!.platforms).toEqual(["pc", "playstation", "switch"]);
  });
  it("drops items without a release date", () => {
    expect(out.find((g) => g.id === 2)).toBeUndefined();
  });
  it("sorts by date then added descending", () => {
    expect(out.map((g) => g.id)).toEqual([4, 3, 1]);
  });
  it("builds the rawg url", () => {
    expect(out.find((g) => g.id === 1)!.url).toBe("https://rawg.io/games/mycopunk");
  });
});

describe("mapGamerPower", () => {
  const base = { id: 1, image: "https://i", open_giveaway_url: "https://g/1", worth: "$9.99" };
  it("cleans title, store and dates", () => {
    const [a, b] = games.mapGamerPower([
      { ...base, title: "GetHigh.EXE (Epic Games) Giveaway", platforms: "PC, Epic Games Store", end_date: "2026-11-02 23:59:00" },
      { ...base, id: 2, title: "Foo Giveaway", platforms: "PC, Steam", end_date: "N/A", worth: "N/A" },
    ]);
    expect(a.title).toBe("GetHigh.EXE");
    expect(a.store).toBe("epic");
    expect(a.endDate).toBe("2026-11-02");
    expect(b.title).toBe("Foo");
    expect(b.store).toBe("steam");
    expect(b.endDate).toBeNull();
    expect(b.worth).toBeNull();
    expect(a.url).toBe("https://g/1");
  });
  it("drops the store and Key suffixes from titles", () => {
    const titles = ["Dwarven Realms (Steam) Key", "Bar (GOG) Key Giveaway", "Baz Key Giveaway"].map(
      (title) => games.mapGamerPower([{ ...base, title, platforms: "PC, Steam", end_date: "N/A" }])[0].title,
    );
    expect(titles).toEqual(["Dwarven Realms", "Bar", "Baz"]);
  });
  it("drops unknown stores", () => {
    expect(games.mapGamerPower([{ ...base, title: "X", platforms: "PC, Itch.io", end_date: "N/A" }])).toEqual([]);
  });
  it("handles non-array input", () => {
    expect(games.mapGamerPower({ status: 0 })).toEqual([]);
  });
});

describe("upcomingReleases", () => {
  const cfg = { url: "https://proj.supabase.co/functions/v1/game-releases", anonKey: "anon-key" };
  const ok = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  it("calls the edge function with the anon key", async () => {
    const f = ok({ results: [{ id: 1, name: "A", slug: "a", released: "2026-11-01", added: 3, parent_platforms: pp("pc"), genres: [] }] });
    const r = await games.upcomingReleases(cfg, f);
    expect(r.ok && r.items.map((g) => g.id)).toEqual([1]);
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe(cfg.url);
    expect(init.headers.apikey).toBe("anon-key");
    expect(init.headers.Authorization).toBe("Bearer anon-key");
  });
  it("returns reason network on non-200", async () => {
    const f = vi.fn(async () => ({ ok: false, status: 502 }));
    expect(await games.upcomingReleases(cfg, f)).toEqual({ ok: false, reason: "network" });
  });
  it("maps thrown errors to network", async () => {
    const f = vi.fn(async () => { throw new Error("down"); });
    expect(await games.upcomingReleases(cfg, f)).toEqual({ ok: false, reason: "network" });
  });
  it("returns no-key when unconfigured", async () => {
    const f = vi.fn();
    const none = { ok: false, reason: "no-key" };
    expect(await games.upcomingReleases({ url: "", anonKey: "k" }, f)).toEqual(none);
    expect(await games.upcomingReleases({ url: cfg.url, anonKey: "" }, f)).toEqual(none);
    expect(await games.upcomingReleases({ url: "https://YOUR_PROJECT_REF.supabase.co/x", anonKey: "k" }, f)).toEqual(none);
    expect(await games.upcomingReleases({ url: cfg.url, anonKey: "YOUR_SUPABASE_ANON_KEY" }, f)).toEqual(none);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("releaseCountdown", () => {
  it("formats days", () => {
    expect(releaseCountdown("2026-10-20", "2026-10-20")).toBe("Out today");
    expect(releaseCountdown("2026-10-21", "2026-10-20")).toBe("In 1 day");
    expect(releaseCountdown("2026-11-01", "2026-10-20")).toBe("In 12 days");
    expect(releaseCountdown("2026-10-19", "2026-10-20")).toBe("Out today");
  });
});

describe("filterByPlatform", () => {
  const l = [{ platforms: ["pc"] }, { platforms: ["xbox"] }] as GameRelease[];
  it("filters", () => {
    expect(filterByPlatform(l, "all")).toHaveLength(2);
    expect(filterByPlatform(l, "xbox")).toHaveLength(1);
  });
});


describe("Home display helpers", () => {
  it("splits a YYYY-MM-DD date without timezone drift", () => {
    expect(dayMonth("2026-10-07")).toEqual({ day: 7, month: "Oct" });
    expect(dayMonth("2027-01-31")).toEqual({ day: 31, month: "Jan" });
  });
  it("asks RAWG for a resized image once", () => {
    expect(rawgImage("https://media.rawg.io/media/games/a/b.jpg", 640))
      .toBe("https://media.rawg.io/media/resize/640/-/games/a/b.jpg");
    expect(rawgImage("https://media.rawg.io/media/resize/640/-/games/a/b.jpg", 420))
      .toBe("https://media.rawg.io/media/resize/640/-/games/a/b.jpg");
    expect(rawgImage("https://elsewhere/x.jpg", 640)).toBe("https://elsewhere/x.jpg");
    expect(rawgImage(null, 640)).toBeNull();
  });
  it("words elapsed time", () => {
    const now = 1_000_000_000_000;
    expect(timeAgo(now - 5_000, now)).toBe("just now");
    expect(timeAgo(now - 60_000, now)).toBe("1 minute ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2 days ago");
  });
});
