import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const season = require("../main/services/season.js") as {
  easterSunday(year: number): Date;
  calendarSeason(date: Date): string | null;
  seasonFor(date: Date): string | null;
};

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const iso = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("easterSunday", () => {
  it("matches published dates", () => {
    expect(iso(season.easterSunday(2024))).toBe("2024-3-31");
    expect(iso(season.easterSunday(2025))).toBe("2025-4-20");
    expect(iso(season.easterSunday(2026))).toBe("2026-4-5");
    expect(iso(season.easterSunday(2027))).toBe("2027-3-28");
    expect(iso(season.easterSunday(2038))).toBe("2038-4-25");
  });
});

describe("calendarSeason", () => {
  it("is null on an ordinary day", () => {
    expect(season.calendarSeason(day(2026, 10, 23))).toBeNull();
    expect(season.calendarSeason(day(2026, 7, 4))).toBeNull();
    expect(season.calendarSeason(day(2026, 11, 2))).toBeNull();
  });

  it("covers the Halloween week", () => {
    expect(season.calendarSeason(day(2026, 10, 24))).toBe("halloween");
    expect(season.calendarSeason(day(2026, 11, 1))).toBe("halloween");
  });

  it("hands Christmas over to New Year after the 27th", () => {
    expect(season.calendarSeason(day(2026, 12, 27))).toBe("christmas");
    expect(season.calendarSeason(day(2026, 12, 28))).toBe("newyear");
    expect(season.calendarSeason(day(2027, 1, 3))).toBe("newyear");
    expect(season.calendarSeason(day(2027, 1, 4))).toBeNull();
  });

  it("covers Valentine's Day", () => {
    expect(season.calendarSeason(day(2027, 2, 14))).toBe("valentines");
    expect(season.calendarSeason(day(2027, 2, 16))).toBeNull();
  });

  it("runs from Palm Sunday to Easter Monday", () => {
    expect(season.calendarSeason(day(2026, 3, 28))).toBeNull();
    expect(season.calendarSeason(day(2026, 3, 29))).toBe("easter");
    expect(season.calendarSeason(day(2026, 4, 6))).toBe("easter");
    expect(season.calendarSeason(day(2026, 4, 7))).toBeNull();
  });
});

describe("seasonFor", () => {
  it("wears the Halloween logo", () => {
    expect(season.seasonFor(day(2026, 10, 31))).toBe("halloween");
  });

  it("keeps the other seasons off for now", () => {
    expect(season.seasonFor(day(2026, 12, 20))).toBeNull();
    expect(season.seasonFor(day(2026, 12, 31))).toBeNull();
    expect(season.seasonFor(day(2027, 2, 14))).toBeNull();
    expect(season.seasonFor(day(2026, 4, 5))).toBeNull();
  });
});
