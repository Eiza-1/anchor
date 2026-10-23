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

const { imageKind } = require("../main/services/background.js") as {
  imageKind(head: Uint8Array): "png" | "jpeg" | "webp" | null;
};

describe("imageKind", () => {
  const bytes = (...b: Array<number | string>) =>
    Uint8Array.from(b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

  it("recognises PNG, JPEG and WebP by their first bytes", () => {
    expect(imageKind(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe("png");
    expect(imageKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe("jpeg");
    expect(imageKind(bytes("RIFF", 1, 2, 3, 4, "WEBP"))).toBe("webp");
  });

  it("rejects a renamed non-picture", () => {
    expect(imageKind(bytes("PK", 3, 4, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(imageKind(bytes("RIFF", 1, 2, 3, 4, "WAVE"))).toBeNull();
    expect(imageKind(new Uint8Array(0))).toBeNull();
  });
});
