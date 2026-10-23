import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { _internal: perf } = require("../main/services/perftweaks.js") as {
  _internal: {
    TWEAKS: Array<{ id: string }>;
    parseFlags(s: string): Record<string, string>;
    isApplied(t: unknown, raw: unknown): boolean;
  };
};
const tweak = (id: string) => perf.TWEAKS.find((t) => t.id === id)!;
const absent = { e: false, v: null, t: null };
const val = (v: unknown) => ({ e: true, v, t: "DWord" });

describe("perf tweak state", () => {
  it("counts a missing value as the Windows default, so Game Mode reads as on out of the box", () => {
    expect(perf.isApplied(tweak("gamemode"), [absent, absent])).toBe(true);
    expect(perf.isApplied(tweak("gamemode"), [val(0), absent])).toBe(false);
  });

  it("needs every value of a multi-value tweak", () => {
    expect(perf.isApplied(tweak("gamecapture"), [val(0), val(0), absent])).toBe(true);
    expect(perf.isApplied(tweak("gamecapture"), [val(0), absent, absent])).toBe(false); // AppCapture defaults on
  });

  it("reads one flag out of the shared DirectX string", () => {
    const raw = { e: true, v: "AutoHDREnable=1;SwapEffectUpgradeEnable=1;", t: "String" };
    expect(perf.isApplied(tweak("swapchain"), raw)).toBe(true);
    expect(perf.isApplied(tweak("vrr"), raw)).toBe(false);
    expect(perf.parseFlags(raw.v)).toEqual({ AutoHDREnable: "1", SwapEffectUpgradeEnable: "1" });
  });

  it("judges animations by Windows' live state, not the registry", () => {
    const off = { ui: 0, client: 0, min: 0, taskbar: absent, fx: val(2) };
    expect(perf.isApplied(tweak("visualfx"), off)).toBe(true);
    expect(perf.isApplied(tweak("visualfx"), { ...off, ui: 1 })).toBe(false);
  });

  it("treats an unreadable setting as not applied", () => {
    expect(perf.isApplied(tweak("gamemode"), undefined)).toBe(false);
  });
});
