import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A Map-backed localStorage, kept across module reloads like a real relaunch.
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

let storage: ReturnType<typeof memoryStorage>;
const g = globalThis as { window?: unknown; localStorage?: unknown };

/** Simulates an app launch: fresh modules over the same localStorage. */
async function launch(anchor: Record<string, unknown>) {
  vi.resetModules();
  g.window = { anchor };
  return {
    ...(await import("@/lib/queries")),
    ...(await import("@/lib/store")),
  };
}

beforeEach(() => {
  storage = memoryStorage();
  g.localStorage = storage;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  delete g.window;
  delete g.localStorage;
});

describe("persisted query cache", () => {
  it("does not call RAWG again on a relaunch within 24 h", async () => {
    const items = [{ id: 1, name: "G" }];
    const gameReleases = vi.fn().mockResolvedValue({ ok: true, items });

    const first = await launch({ gameReleases });
    expect(await first.Q.releases()).toEqual(items);
    expect(gameReleases).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3 * 60 * 60_000); // 3 h later, the app is started again
    const second = await launch({ gameReleases });
    expect(second.peek("games:releases")).toEqual(items);
    expect(await second.Q.releases()).toEqual(items);
    expect(gameReleases).toHaveBeenCalledTimes(1);
  });

  it("refetches on a relaunch after 24 h", async () => {
    const gameReleases = vi.fn().mockResolvedValue({ ok: true, items: [] });
    await (await launch({ gameReleases })).Q.releases();
    vi.advanceTimersByTime(25 * 60 * 60_000);
    await (await launch({ gameReleases })).Q.releases();
    expect(gameReleases).toHaveBeenCalledTimes(2);
  });

  it("re-reads once-per-session data on every launch, but shows the saved value first", async () => {
    const isAdmin = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const first = await launch({ isAdmin });
    expect(await first.Q.isAdmin()).toBe(false);
    expect(await first.Q.isAdmin()).toBe(false); // fresh for the rest of the session
    expect(isAdmin).toHaveBeenCalledTimes(1);

    const second = await launch({ isAdmin });
    expect(second.peek("isAdmin")).toBe(false);
    expect(await second.Q.isAdmin()).toBe(true);
    expect(isAdmin).toHaveBeenCalledTimes(2);
  });

  it("ignores and removes entries saved in the old, unversioned format", async () => {
    storage.setItem("anchor:cache:games:releases", JSON.stringify([{ id: 9 }]));
    const gameReleases = vi.fn().mockResolvedValue({ ok: true, items: [] });
    const app = await launch({ gameReleases });
    expect(app.peek("games:releases")).toBeUndefined();
    expect(storage.getItem("anchor:cache:games:releases")).toBeNull();
  });
});
