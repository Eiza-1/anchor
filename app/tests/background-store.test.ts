import { afterEach, describe, expect, it, vi } from "vitest";

const g = globalThis as { window?: unknown };
afterEach(() => { vi.resetModules(); delete g.window; });

describe("custom background in the renderer", () => {
  it("is shown through a short blob: URL, and the previous one is released", async () => {
    const getBackground = vi.fn()
      .mockResolvedValueOnce({ type: "image/png", bytes: new Uint8Array([1, 2, 3]) })
      .mockResolvedValueOnce(null);
    g.window = { anchor: { getBackground } };
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { refreshBackground, getBackgroundSnapshot, themeBackground } = await import("@/lib/background");

    await refreshBackground();
    const first = getBackgroundSnapshot();
    expect(first.custom).toBe(true);
    expect(first.url).toMatch(/^blob:/);

    await refreshBackground();
    expect(revoke).toHaveBeenCalledWith(first.url);
    expect(getBackgroundSnapshot()).toEqual({ url: themeBackground("dark"), custom: false });
  });
});
