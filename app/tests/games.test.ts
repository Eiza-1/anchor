import { createRequire } from "module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseCountdown, filterByPlatform } from "@/lib/games";
import type { GameRelease, GamesResult } from "@/types";

const require = createRequire(import.meta.url);
const games = require("../main/services/games.js") as {
  mapRawg(json: unknown): GameRelease[];
  mapGamerPower(json: unknown): { title: string; store: string; endDate: string | null; worth: string | null; url: string }[];
  upcomingReleases(key: string, today: string, days?: number): Promise<GamesResult<GameRelease>>;
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
  it("drops unknown stores", () => {
    expect(games.mapGamerPower([{ ...base, title: "X", platforms: "PC, Itch.io", end_date: "N/A" }])).toEqual([]);
  });
  it("handles non-array input", () => {
    expect(games.mapGamerPower({ status: 0 })).toEqual([]);
  });
});

describe("upcomingReleases", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns no-key without fetching", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await games.upcomingReleases("", "2026-10-20")).toEqual({ ok: false, reason: "no-key" });
    expect(f).not.toHaveBeenCalled();
  });
  it("maps non-2xx to network", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    expect(await games.upcomingReleases("k", "2026-10-20")).toEqual({ ok: false, reason: "network" });
  });
  it("maps thrown errors to network", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await games.upcomingReleases("k", "2026-10-20")).toEqual({ ok: false, reason: "network" });
  });
  it("requests the 45-day window", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }));
    vi.stubGlobal("fetch", f);
    const r = await games.upcomingReleases("k", "2026-10-20");
    expect(r).toEqual({ ok: true, items: [] });
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("dates=2026-10-20,2026-12-04");
    expect(url).toContain("page_size=40");
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
