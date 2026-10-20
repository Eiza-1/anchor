import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.useRealTimers(); vi.resetModules(); delete (globalThis as { window?: unknown }).window; });

describe("Q.releases / Q.freeGames", () => {
  it("rejects on failure and keeps the last good list", async () => {
    vi.resetModules();
    const good = [{ id: 1, name: "G" }];
    const gameReleases = vi.fn()
      .mockResolvedValueOnce({ ok: true, items: good })
      .mockResolvedValue({ ok: false, reason: "network" });
    (globalThis as { window?: unknown }).window = { anchor: { gameReleases, freeGames: vi.fn().mockResolvedValue({ ok: false, reason: "no-key" }) } };
    vi.useFakeTimers();
    const { Q } = await import("@/lib/queries");
    const { peek } = await import("@/lib/store");
    expect(await Q.releases()).toEqual(good);
    vi.advanceTimersByTime(25 * 60 * 60_000); // past the 24 h TTL
    await expect(Q.releases()).rejects.toThrow("network");
    expect(gameReleases).toHaveBeenCalledTimes(2);
    expect(peek("games:releases")).toEqual(good);
    await expect(Q.freeGames()).rejects.toThrow("no-key");
    expect(peek("games:free")).toBeUndefined();
  });
});
