import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Entry = { name?: string; command?: string; path?: string; source?: string; runAs?: string };
const { _internal: bw } = require("../main/services/bootwatch.js") as {
  _internal: {
    filesIn(command: string): string[];
    judge(e: Entry, signed: Set<string>): { microsoft: boolean; level: string; reasons: string[] };
  };
};

const DEFENDER = "C:\\ProgramData\\Microsoft\\Windows Defender\\Platform\\4.18.26090.9-0\\MsMpEng.exe";
const HOTPATCH = "%systemroot%\\system32\\cmd.exe /d /c %systemroot%\\system32\\hpatchmonTask.cmd";
const signed = (...files: string[]) => new Set(files.map((f) => f.toLowerCase()));

describe("files a startup command runs", () => {
  it("reads quoted, unquoted, environment-variable and bare paths", () => {
    expect(bw.filesIn(`"${DEFENDER}"`)).toEqual([DEFENDER]);
    expect(bw.filesIn(HOTPATCH)).toEqual([
      "%systemroot%\\system32\\cmd.exe", "%systemroot%\\system32\\hpatchmonTask.cmd",
    ]);
    expect(bw.filesIn("C:\\Program Files\\Vendor App\\app.exe --tray")).toEqual(["C:\\Program Files\\Vendor App\\app.exe"]);
    expect(bw.filesIn("rundll32.exe shell32.dll,Control_RunDLL")).toEqual(["rundll32.exe", "shell32.dll"]);
  });

  it("finds no file in an inline command", () => {
    expect(bw.filesIn("powershell -w hidden -enc SQBFAFgA")).toEqual([]);
  });
});

describe("Microsoft-signed startup entries", () => {
  it("never flags Defender, even from ProgramData as SYSTEM", () => {
    const e = { name: "WinDefend", command: `"${DEFENDER}"`, path: `"${DEFENDER}"`, source: "Service", runAs: "LocalSystem" };
    expect(bw.judge(e, signed()).level).toBe("high"); // unsigned copy in the same place: still suspicious
    expect(bw.judge(e, signed(DEFENDER))).toMatchObject({ microsoft: true, level: "low", reasons: [] });
  });

  it("trusts Windows' own script when both the interpreter and the script are signed", () => {
    const e = { name: "Monitoring", command: HOTPATCH, path: "%systemroot%\\system32\\cmd.exe", source: "Scheduled task" };
    const both = signed("%systemroot%\\system32\\cmd.exe", "%systemroot%\\system32\\hpatchmonTask.cmd");
    expect(bw.judge(e, both).microsoft).toBe(true);
    expect(bw.judge(e, signed("%systemroot%\\system32\\cmd.exe")).microsoft).toBe(false); // planted script
  });

  it("does not trust a signed interpreter running an inline command", () => {
    const e = { name: "Updater", command: "powershell.exe -w hidden -enc SQBFAFgA", path: "powershell.exe", source: "Run key" };
    const v = bw.judge(e, signed("powershell.exe"));
    expect(v.microsoft).toBe(false);
    expect(v.level).not.toBe("low");
  });

  it("does not trust a signed interpreter whose command line hides or downloads", () => {
    const e = {
      name: "x", source: "Scheduled task", path: "C:\\Windows\\System32\\cmd.exe",
      command: "C:\\Windows\\System32\\cmd.exe /c start /min C:\\Windows\\System32\\x.cmd",
    };
    const v = bw.judge(e, signed("C:\\Windows\\System32\\cmd.exe", "C:\\Windows\\System32\\x.cmd"));
    expect(v.microsoft).toBe(false);
  });
});
