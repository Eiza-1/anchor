import { describe, expect, it } from "vitest";
import { summarize } from "../src/components/FpsMeter";

describe("summarize", () => {
  it("reads a 144 Hz display from its typical frame gap", () => {
    const gaps = Array(100).fill(1000 / 144);
    expect(summarize(gaps, 144)).toMatchObject({ hz: 144, fps: 144, dropped: 0 });
  });

  it("counts frames that took 1.5x the typical gap or longer as dropped", () => {
    const gaps = [...Array(57).fill(16.7), 33.4, 50.1, 20];
    const s = summarize(gaps, 57);
    expect(s.hz).toBe(60);
    expect(s.dropped).toBe(2);
    expect(s.worst).toBeCloseTo(50.1);
  });
});
