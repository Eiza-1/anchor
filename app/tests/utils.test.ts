import { describe, expect, it } from "vitest";
import { countSummary } from "@/lib/utils";

describe("countSummary", () => {
  it("says how many of the total worked when some failed", () => {
    expect(countSummary("Removed", 2, 3, "app")).toBe("Removed 2 of 3 apps");
    expect(countSummary("Applied", 1, 4, "tweak")).toBe("Applied 1 of 4 tweaks");
  });

  it("drops the total when everything worked", () => {
    expect(countSummary("Removed", 1, 1, "app")).toBe("Removed 1 app");
    expect(countSummary("Applied", 5, 5, "tweak")).toBe("Applied 5 tweaks");
  });
});
