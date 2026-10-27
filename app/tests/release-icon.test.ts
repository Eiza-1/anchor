import { createRequire } from "module";
import path from "path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { iconFor } = require("../scripts/release-icon.js") as { iconFor(date: Date): string };

describe("iconFor", () => {
  it("bakes the Halloween logo into a release built during Halloween", () => {
    expect(path.basename(iconFor(new Date(2026, 9, 27)))).toBe("anchor-halloween.ico");
  });

  it("goes back to the normal logo once the season is over", () => {
    expect(path.basename(iconFor(new Date(2026, 10, 2)))).toBe("anchor.ico");
  });

  it("uses the normal logo for seasons that aren't switched on", () => {
    expect(path.basename(iconFor(new Date(2026, 11, 10)))).toBe("anchor.ico"); // Christmas
  });
});
