import { createRequire } from "module";
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createManualFetch } = require("../main/services/manualfetch.js") as {
  createManualFetch(net: unknown, maxBytes: number): (url: string) => Promise<Response>;
};

// A stand-in for Electron's net.request: the test decides what the "server" does.
function fakeNet() {
  const req = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    end: vi.fn(),
    abort: vi.fn(),
  });
  return { req, net: { request: vi.fn(() => req) } };
}

afterEach(() => vi.useRealTimers());

describe("createManualFetch", () => {
  it("resolves a normal response", async () => {
    const { req, net } = fakeNet();
    const p = createManualFetch(net, 100)("https://x/a.jpg");
    const res = Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "image/jpeg" } });
    req.emit("response", res);
    res.emit("data", Buffer.from("abc"));
    res.emit("end");
    const r = await p;
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("abc");
  });

  it("aborts and rejects a request that never finishes, after 15 s", async () => {
    vi.useFakeTimers();
    const { req, net } = fakeNet();
    const p = createManualFetch(net, 100)("https://x/slow.jpg");
    const settled = vi.fn();
    p.then(settled, settled);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).rejects.toThrow("timed out");
    expect(req.abort).toHaveBeenCalled();
  });

  it("rejects instead of throwing when the response can't be built", async () => {
    const { req, net } = fakeNet();
    const p = createManualFetch(net, 100)("https://x/a.jpg");
    req.emit("response", Object.assign(new EventEmitter(), { statusCode: 200, headers: { "bad header": "x" } }));
    await expect(p).rejects.toThrow();
    expect(req.abort).toHaveBeenCalled();
  });
});
