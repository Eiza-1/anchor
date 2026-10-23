import { createRequire } from "module";
import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const cp = require("child_process") as { spawn: unknown };
const realSpawn = cp.spawn;

type Ps = {
  runPSJson(command: string, opts?: { long?: boolean }): Promise<unknown>;
  shutdown(): void;
};

// Fake powershell.exe: pooled hosts answer READY and then reply to each read at
// once, but sit on a long script (as a Windows Update search would); one-off
// processes stay open until the test ends them.
interface FakeProc extends EventEmitter {
  args: string[];
  stdout: EventEmitter & { setEncoding(): void };
  stderr: EventEmitter;
  stdin: { write(line: string): void; end(): void };
  ended: boolean;
  kill(): void;
}
let procs: FakeProc[];

function fakeSpawn(_exe: string, args: string[]) {
  const proc = new EventEmitter() as FakeProc;
  proc.args = args;
  proc.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
  proc.stderr = new EventEmitter();
  const isHost = args.includes("-EncodedCommand") && !isOneOff(args);
  proc.stdin = {
    write(line: string) {
      if (Buffer.from(line.trim(), "base64").toString("utf8").includes("LONG-SCRIPT")) return;
      const json = Buffer.from(JSON.stringify({ out: '{"read":true}', err: "" }), "utf8").toString("base64");
      setTimeout(() => proc.stdout.emit("data", `@@ANCHOR@@${json}\n`), 0);
    },
    // closing stdin ends the host's read loop, so it exits
    end() { proc.ended = true; setTimeout(() => proc.emit("exit", 0), 0); },
  };
  proc.ended = false;
  proc.kill = () => proc.emit("exit", 1);
  procs.push(proc);
  if (isHost) setTimeout(() => proc.stdout.emit("data", "@@ANCHOR@@READY\n"), 0);
  return proc;
}

// One-off long scripts are sent encoded too; tell them apart by their decoded body.
function isOneOff(args: string[]) {
  const i = args.indexOf("-EncodedCommand");
  return i !== -1 && Buffer.from(args[i + 1], "base64").toString("utf16le").includes("LONG-SCRIPT");
}

let ps: Ps;
beforeEach(() => {
  procs = [];
  cp.spawn = fakeSpawn;
  delete require.cache[require.resolve("../main/services/ps.js")];
  ps = require("../main/services/ps.js") as Ps;
});
afterEach(() => {
  ps.shutdown();
  cp.spawn = realSpawn;
  delete require.cache[require.resolve("../main/services/ps.js")];
});

describe("runPSJson", () => {
  it("runs long scripts outside the host pool, so page reads don't queue behind them", async () => {
    const long = [1, 2, 3, 4].map(() => ps.runPSJson("'LONG-SCRIPT'", { long: true }));
    const read = await Promise.race([
      ps.runPSJson("Get-Something"),
      new Promise((r) => setTimeout(() => r("queued"), 500)),
    ]);
    expect(read).toEqual({ read: true });

    const oneOff = procs.filter((p) => isOneOff(p.args));
    expect(oneOff).toHaveLength(4);
    // the long lane parses JSON the same way as the pool
    oneOff.forEach((p, i) => { p.stdout.emit("data", Buffer.from(`WARNING: x\n{"n":${i}}`)); p.emit("close", 0); });
    expect(await Promise.all(long)).toEqual([{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }]);
  });
});

describe("host pool", () => {
  afterEach(() => vi.useRealTimers());

  it("lets idle hosts exit, and starts one again for the next read", async () => {
    vi.useFakeTimers();
    const first = ps.runPSJson("Get-Something");
    await vi.advanceTimersByTimeAsync(10);
    expect(await first).toEqual({ read: true });
    const hosts = () => procs.filter((p) => !isOneOff(p.args));
    expect(hosts().filter((p) => !p.ended)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(hosts()[0].ended).toBe(false);   // still warm for a while after use
    await vi.advanceTimersByTimeAsync(2_000);
    expect(hosts().every((p) => p.ended)).toBe(true);

    const again = ps.runPSJson("Get-Something");
    await vi.advanceTimersByTimeAsync(10);
    expect(await again).toEqual({ read: true });
    expect(hosts()).toHaveLength(2);
  });
});
