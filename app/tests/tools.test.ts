import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const cp = require("child_process") as { spawn: unknown };
const realSpawn = cp.spawn;
const systemPath = require.resolve("../main/services/system.js");

type Sys = { openTool(id: string): boolean };
let spawn: ReturnType<typeof vi.fn>;
let sys: Sys;

beforeEach(() => {
  spawn = vi.fn(() => ({ unref() {} }));
  cp.spawn = spawn; // system.js destructures spawn at load, so swap first
  delete require.cache[systemPath];
  sys = require(systemPath);
});
afterEach(() => {
  cp.spawn = realSpawn;
  delete require.cache[systemPath];
});

describe("openTool allowlist", () => {
  it("launches a known tool", () => {
    expect(sys.openTool("resmon")).toBe(true);
    expect(spawn.mock.calls[0][0]).toBe("cmd");
    expect(spawn.mock.calls[0][1]).toEqual(["/c", "start", "", "resmon.exe"]);
  });
  it("refuses an unknown id", () => {
    expect(sys.openTool("calc.exe & whoami")).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });
  it("refuses inherited keys", () => {
    expect(sys.openTool("constructor")).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });
});
