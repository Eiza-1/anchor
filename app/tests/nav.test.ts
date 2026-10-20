import { beforeEach, describe, expect, it, vi } from "vitest";

let nav: typeof import("@/lib/nav");
beforeEach(async () => {
  vi.resetModules();
  nav = await import("@/lib/nav");
});

describe("nav", () => {
  it("starts on home", () => {
    expect(nav.getNav()).toEqual({ section: "home" });
  });

  it("remembers the open tab per section", () => {
    nav.navigate({ section: "system", tab: "drives" });
    nav.navigate({ section: "home" });
    nav.navigate({ section: "system" });
    expect(nav.getNav().tab).toBe("drives");
  });

  it("isViewing matches the exact tab only when a tab is given", () => {
    nav.navigate({ section: "system", tab: "drives" });
    expect(nav.isViewing({ section: "system", tab: "drives" })).toBe(true);
    expect(nav.isViewing({ section: "system", tab: "other" })).toBe(false);
    expect(nav.isViewing({ section: "home" })).toBe(false);
  });

  it("isViewing without a tab matches any tab of the section", () => {
    nav.navigate({ section: "system", tab: "drives" });
    expect(nav.isViewing({ section: "system" })).toBe(true);
    nav.navigate({ section: "system", tab: "other" });
    expect(nav.isViewing({ section: "system" })).toBe(true);
  });

  it("notifies subscribers on change only", () => {
    const l = vi.fn();
    const off = nav.subscribeNav(l);
    nav.navigate({ section: "system", tab: "drives" });
    expect(l).toHaveBeenCalledTimes(1);
    nav.navigate({ section: "system", tab: "drives" });
    expect(l).toHaveBeenCalledTimes(1);
    off();
    nav.navigate({ section: "home" });
    expect(l).toHaveBeenCalledTimes(1);
  });
});
