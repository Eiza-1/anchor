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
let psJson: (cmd: string) => Promise<unknown> = async () => [];
ps.runPSJson = (cmd: string) => psJson(cmd);
for (const f of ["bootwatch", "system"]) delete require.cache[require.resolve(`../main/services/${f}.js`)];
const bw = require("../main/services/bootwatch.js") as { disableEntry(id: string): Promise<{ ok: boolean; error?: string }> };
const sys = require("../main/services/system.js") as {
  startupToggle(n: string, scope: string, enable: boolean): Promise<{ ok: boolean; error?: string }>;
  checkUpdates(opts?: { fresh?: boolean }): Promise<{ pending?: number; error?: string }>;
};

beforeEach(() => { ran.length = 0; });

describe("Boot Watch disableEntry", () => {
  it("keeps a task name with curly quotes inside its literal", async () => {
    await bw.disableEntry("task|\\Vendor\\x\u2019y\u2018z");
    expect(ran).toEqual(["Disable-ScheduledTask -TaskPath '\\Vendor\\' -TaskName 'x\u2019\u2019y\u2018\u2018z'"]);
  });

  it("keeps a Run value name with a curly quote inside its literal", async () => {
    await bw.disableEntry("run|HKCU:\\Software\\Run|a\u2019; calc; \u2019b");
    expect(ran[0]).toBe("Remove-ItemProperty -LiteralPath 'HKCU:\\Software\\Run' -Name 'a\u2019\u2019; calc; \u2019\u2019b' -Force");
  });

  it("splits a Run id at the first | only, keeping a | in the value name", async () => {
    await bw.disableEntry("run|HKCU:\\Software\\Run|a|b");
    expect(ran[0]).toBe("Remove-ItemProperty -LiteralPath 'HKCU:\\Software\\Run' -Name 'a|b' -Force");
  });

  it("refuses a Run entry with an empty value name", async () => {
    expect((await bw.disableEntry("run|HKCU:\\Software\\Run|")).ok).toBe(false);
    expect((await bw.disableEntry("run|HKCU:\\Software\\Run")).ok).toBe(false);
    expect(ran).toEqual([]);
  });

  it("removes an IFEO debugger by literal path", async () => {
    await bw.disableEntry("ifeo|a*.exe");
    expect(ran[0]).toBe("Remove-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\a*.exe' -Name Debugger -Force");
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

describe("checkUpdates", () => {
  it("caches the local read, but a fresh check reads again", async () => {
    const calls: string[] = [];
    psJson = async (cmd) => { calls.push(cmd); return { pending: calls.length }; };
    expect(await sys.checkUpdates({ fresh: true })).toEqual({ pending: 1 });
    expect(await sys.checkUpdates()).toEqual({ pending: 1 });          // prefetch/diagnostics: cached
    expect(await sys.checkUpdates({ fresh: true })).toEqual({ pending: 2 });
    psJson = async () => [];
  });

  it("passes PowerShell's error text through, and doesn't cache it", async () => {
    psJson = async () => ({ error: "Exception from HRESULT: 0x8024402C" });
    expect(await sys.checkUpdates({ fresh: true })).toEqual({ error: "Exception from HRESULT: 0x8024402C" });
    psJson = async () => ({ pending: 0 });
    await new Promise((r) => setTimeout(r, 0)); // let the failure drop out of the cache
    expect(await sys.checkUpdates()).toEqual({ pending: 0 });
    psJson = async () => [];
  });
});
