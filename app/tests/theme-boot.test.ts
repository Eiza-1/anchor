import { afterEach, describe, expect, it, vi } from "vitest";

const g = globalThis as { document?: unknown; localStorage?: unknown };
afterEach(() => { vi.resetModules(); delete g.document; delete g.localStorage; });

function fakeDom(saved: string | null) {
  const classes = new Set(["dark"]);
  const html = {
    dataset: {} as Record<string, string>,
    classList: { toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)) },
  };
  g.document = { documentElement: html };
  g.localStorage = { getItem: () => saved, setItem: () => {} };
  return { html, classes };
}

describe("theme on launch", () => {
  it("applies last launch's theme before the first render, so the background starts on it", async () => {
    const { html, classes } = fakeDom("light");
    await import("@/lib/theme-boot");
    const { getBackgroundSnapshot, themeBackground } = await import("@/lib/background");
    expect(html.dataset.theme).toBe("light");
    expect(classes.has("dark")).toBe(false);
    expect(getBackgroundSnapshot().url).toBe(themeBackground("light"));
  });

  it("leaves Dark alone when nothing was saved", async () => {
    const { html, classes } = fakeDom(null);
    await import("@/lib/theme-boot");
    expect(html.dataset.theme).toBeUndefined();
    expect(classes.has("dark")).toBe(true);
  });
});
