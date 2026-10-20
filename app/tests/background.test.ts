import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { validateBackground } = require("../main/services/background.js") as {
  validateBackground(file: string, sizeBytes: number): string | null;
};

describe("validateBackground", () => {
  it("accepts png/jpg/jpeg/webp in any case", () => {
    expect(validateBackground("a.PNG", 1000)).toBeNull();
    expect(validateBackground("C:\pics\b.jpeg", 1000)).toBeNull();
    expect(validateBackground("c.Webp", 1000)).toBeNull();
  });

  it("rejects other file types", () => {
    expect(validateBackground("a.gif", 1000)).toMatch(/png, jpg or webp/i);
    expect(validateBackground("noext", 1000)).toMatch(/png, jpg or webp/i);
  });

  it("rejects files over 15 MB", () => {
    expect(validateBackground("a.jpg", 15 * 1024 * 1024 + 1)).toMatch(/15 MB/);
    expect(validateBackground("a.jpg", 15 * 1024 * 1024)).toBeNull();
  });
});
