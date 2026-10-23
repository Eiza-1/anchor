import { describe, expect, it } from "vitest";
import { groupByDay, timeAgo, mergeVideos } from "../src/lib/spotlight";

// Oct 22 2026, 15:00 local time
const NOW = new Date(2026, 9, 22, 15, 0).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe("timeAgo", () => {
  it("counts minutes and hours within a day", () => {
    expect(timeAgo(at(22, 14, 55), NOW)).toBe("5m ago");
    expect(timeAgo(at(22, 15, 0), NOW)).toBe("1m ago");
    expect(timeAgo(at(22, 12, 0), NOW)).toBe("3h ago");
  });

  it("says Yesterday, then falls back to a short date", () => {
    expect(timeAgo(at(21, 9, 0), NOW)).toBe("Yesterday");
    expect(timeAgo(at(18, 9, 0), NOW)).toMatch(/Oct 18|18 Oct/);
  });

  it("is blank for items without a date", () => {
    expect(timeAgo(0, NOW)).toBe("");
  });
});

describe("groupByDay", () => {
  const item = (published: number) => ({ published });

  it("splits by calendar day, not by 24 hours", () => {
    const groups = groupByDay([item(at(22, 0, 30)), item(at(21, 23, 30)), item(at(20, 23, 59))], NOW);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 1],
      ["Earlier", 1],
    ]);
  });

  it("leaves out empty days and keeps the input order inside a day", () => {
    const a = item(at(20, 10)), b = item(at(19, 10));
    const groups = groupByDay([a, b], NOW);
    expect(groups).toEqual([{ label: "Earlier", items: [a, b] }]);
  });

  it("puts undated items under Earlier", () => {
    expect(groupByDay([item(0)], NOW)[0].label).toBe("Earlier");
  });
});

describe("mergeVideos", () => {
  const v = (source: string, link: string, published: number) => ({ source, link, published });

  it("keeps a failed channel's last videos and replaces the ones that answered", () => {
    const prev = [v("Vex", "old-vex", 1), v("MKBHD", "old-mkbhd", 2)];
    const fresh = [v("MKBHD", "new-mkbhd", 5)];
    expect(mergeVideos(fresh, prev, ["Vex", "MKBHD"]).map((x) => x.link)).toEqual(["new-mkbhd", "old-vex"]);
  });

  it("drops channels that are no longer in the list", () => {
    const prev = [v("Gone", "gone", 9)];
    expect(mergeVideos([v("Vex", "vex", 1)], prev, ["Vex"]).map((x) => x.link)).toEqual(["vex"]);
  });
});
