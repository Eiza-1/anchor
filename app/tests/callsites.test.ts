import { createRequire } from "module";
import { beforeEach, describe, expect, it } from "vitest";

// Call-site checks: the services must hand runPS a command in which a name
// holding a curly quote stays inside its literal, and must refuse bad input
// before running anything. ps.js is patched before the services load, since
// they destructure runPS at require time.
const require = createRequire(import.meta.url);
const ps = require("../main/services/ps.js") as Record<string, unknown>;
const ran: string[] = [];
ps.runPS = async (cmd: string) => { ran.push(cmd); return { code: 0, out: "", err: "" }; };
ps.runPSJson = async () => [];
for (const f of ["bootwatch", "system"]) delete require.cache[require.resolve(`../main/services/${f}.js`)];
const bw = require("../main/services/bootwatch.js") as { disableEntry(id: string): Promise<{ ok: boolean; error?: string }> };
const sys = require("../main/services/system.js") as { startupToggle(n: string, scope: string, enable: boolean): Promise<{ ok: boolean; error?: string }> };

beforeEach(() => { ran.length = 0; });

describe("Boot Watch disableEntry", () => {
  it("keeps a task name with curly quotes inside its literal", async () => {
    await bw.disableEntry("task|\\Vendor\\x\u2019y\u2018z");
    expect(ran).toEqual(["Disable-ScheduledTask -TaskPath '\\Vendor\\' -TaskName 'x\u2019\u2019y\u2018\u2018z'"]);
  });

  it("keeps a Run value name with a curly quote inside its literal", async () => {
    await bw.disableEntry("run|HKCU:\\Software\\Run|a\u2019; calc; \u2019b");
    expect(ran[0]).toBe("Remove-ItemProperty -Path 'HKCU:\\Software\\Run' -Name 'a\u2019\u2019; calc; \u2019\u2019b' -Force");
  });

  it("refuses a Run key that isn't a registry path", async () => {
    const r = await bw.disableEntry("run|C:\\Windows|name");
    expect(r.ok).toBe(false);
    expect(ran).toEqual([]);
  });
});

describe("startupToggle", () => {
  it("keeps a name with curly quotes inside its literal", async () => {
    await sys.startupToggle("a\u2019b", "You", false);
    expect(ran[0]).toContain("-Name 'a\u2019\u2019b' -Value");
  });

  it("rejects an unknown scope without running anything", async () => {
    const r = await sys.startupToggle("x", "Everyone'; calc; '", true);
    expect(r.ok).toBe(false);
    expect(ran).toEqual([]);
  });
});
