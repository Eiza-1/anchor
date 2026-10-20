import { describe, it, expect } from "vitest";
import { volumeStats, tempInfo } from "@/lib/drives";

describe("volumeStats", () => {
  it("flags low at 5% free", () => {
    const s = volumeStats({ FreeSpace: 50, Size: 1000 });
    expect(s.used).toBe(950);
    expect(s.freePct).toBe(5);
    expect(s.level).toBe("low");
  });
  it("flags critical below 5%", () => {
    expect(volumeStats({ FreeSpace: 40, Size: 1000 }).level).toBe("critical");
  });
  it("ok at half full", () => {
    const s = volumeStats({ FreeSpace: 500, Size: 1000 });
    expect(s.level).toBe("ok");
    expect(s.usedPct).toBe(50);
  });
  it("never NaN for empty volumes", () => {
    for (const s of [volumeStats({ FreeSpace: 0, Size: 0 }), volumeStats({})]) {
      for (const n of [s.total, s.free, s.used, s.usedPct, s.freePct]) {
        expect(n).toBe(0);
        expect(Number.isFinite(n)).toBe(true);
      }
      expect(s.level).toBe("ok");
    }
  });
});

describe("tempInfo", () => {
  it("formats and tones", () => {
    expect(tempInfo(44, false)).toEqual({ text: "44°C", tone: "normal" });
    expect(tempInfo(60, true).tone).toBe("warm");
    expect(tempInfo(75, true).tone).toBe("hot");
  });
  it("explains missing readings", () => {
    expect(tempInfo(null, false).text).toMatch(/admin/);
    expect(tempInfo(0, true).text).toBe("Not reported by this drive");
    expect(tempInfo(undefined, true).tone).toBe("muted");
  });
});
