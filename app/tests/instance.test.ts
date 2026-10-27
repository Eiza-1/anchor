import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const instance = require("../main/services/instance.js") as {
  listen(userData: string, onShow: () => void): import("net").Server;
  clearPort(userData: string): void;
  poke(userData: string): Promise<boolean>;
  isElevated(): Promise<boolean>;
};

const dirs: string[] = [];
const servers: import("net").Server[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "anchor-inst-")); dirs.push(d); return d; };
const listening = (s: import("net").Server) => new Promise<void>((r) => (s.listening ? r() : s.once("listening", () => setTimeout(r, 10))));

afterEach(() => {
  servers.splice(0).forEach((s) => s.close());
  dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});

describe("listen / poke", () => {
  it("a later launch asks the running one to show its window", async () => {
    const dir = tmp();
    const onShow = vi.fn();
    const s = instance.listen(dir, onShow);
    servers.push(s);
    await listening(s);
    expect(await instance.poke(dir)).toBe(true);
    await vi.waitFor(() => expect(onShow).toHaveBeenCalledTimes(1));
  });

  it("ignores anything but 'show'", async () => {
    const dir = tmp();
    const onShow = vi.fn();
    const s = instance.listen(dir, onShow);
    servers.push(s);
    await listening(s);
    const net = await import("net");
    const port = +fs.readFileSync(path.join(dir, "instance.port"), "utf8");
    await new Promise<void>((r) => { const c = net.connect(port, "127.0.0.1", () => c.end("quit\n", () => r())); });
    await new Promise((r) => setTimeout(r, 50));
    expect(onShow).not.toHaveBeenCalled();
  });

  it("reports false when no Anchor is listening", async () => {
    const dir = tmp();
    expect(await instance.poke(dir)).toBe(false);          // no port file
    fs.writeFileSync(path.join(dir, "instance.port"), "1"); // stale port
    expect(await instance.poke(dir)).toBe(false);
  });

  it("drops a crashed instance's port file before listening", async () => {
    const dir = tmp();
    const file = path.join(dir, "instance.port");
    fs.writeFileSync(file, "1"); // left behind by a crash
    const s = instance.listen(dir, vi.fn());
    servers.push(s);
    expect(fs.existsSync(file)).toBe(false); // gone before our own port is known
    await listening(s);
    expect(+fs.readFileSync(file, "utf8")).toBe((s.address() as import("net").AddressInfo).port);
  });

  it("clearPort on quit stops later launches poking the old port", async () => {
    const dir = tmp();
    const s = instance.listen(dir, vi.fn());
    servers.push(s);
    await listening(s);
    instance.clearPort(dir);
    expect(fs.existsSync(path.join(dir, "instance.port"))).toBe(false);
    expect(await instance.poke(dir)).toBe(false);
  });
});

describe("isElevated", () => {
  it("answers with a boolean", async () => {
    expect(typeof (await instance.isElevated())).toBe("boolean");
  });
});
