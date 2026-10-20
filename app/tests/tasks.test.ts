import { beforeEach, describe, expect, it, vi } from "vitest";

let t: typeof import("@/lib/tasks");
beforeEach(async () => {
  vi.resetModules();
  t = await import("@/lib/tasks");
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const where = { section: "cleanup" };

describe("runTask", () => {
  it("runs and stores result", async () => {
    const r = await t.runTask("a", { label: "A", where }, async () => 5);
    expect(r).toBe(5);
    const task = t.getTask<number>("a")!;
    expect(task.status).toBe("done");
    expect(task.result).toBe(5);
    expect(task.finishedAt).toBeTypeOf("number");
  });

  it("dedupes same key while running", async () => {
    const d = deferred<number>();
    const first = t.runTask("a", { label: "A", where }, () => d.promise);
    const fn = vi.fn(async () => 2);
    expect(await t.runTask("a", { label: "A", where }, fn)).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    d.resolve(7);
    expect(await first).toBe(7);
  });

  it("rejection becomes error and does not throw", async () => {
    const r = await t.runTask("a", { label: "A", where }, async () => { throw new Error("boom"); });
    expect(r).toBeUndefined();
    const task = t.getTask("a")!;
    expect(task.status).toBe("error");
    expect(task.error).toBe("boom");
  });

  it("isError marks resolved failures", async () => {
    await t.runTask<{ ok: boolean; message?: string }>(
      "a",
      { label: "A", where, isError: (r) => (r.ok ? null : r.message ?? "failed") },
      async () => ({ ok: false, message: "denied" }),
    );
    const task = t.getTask("a")!;
    expect(task.status).toBe("error");
    expect(task.error).toBe("denied");
  });

  it("summarize output lands in task.summary", async () => {
    await t.runTask("a", { label: "A", where, summarize: (n: number) => `got ${n}` }, async () => 3);
    expect(t.getTask("a")!.summary).toBe("got 3");
  });

  it("defaults silent to false", async () => {
    await t.runTask("a", { label: "A", where }, async () => 1);
    await t.runTask("b", { label: "B", where, silent: true }, async () => 1);
    expect(t.getTask("a")!.silent).toBe(false);
    expect(t.getTask("b")!.silent).toBe(true);
  });

  it("clearTask removes a task", async () => {
    await t.runTask("a", { label: "A", where }, async () => 1);
    t.clearTask("a");
    expect(t.getTask("a")).toBeUndefined();
  });
});

describe("conflicts", () => {
  it("blocks a second task in the same cleanup group", async () => {
    const d = deferred<number>();
    const first = t.runTask("c1", { label: "C1", where, group: "cleanup" }, () => d.promise);
    expect(t.blockedBy("cleanup")?.key).toBe("c1");
    const fn = vi.fn(async () => 1);
    expect(await t.runTask("c2", { label: "C2", where, group: "cleanup" }, fn)).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    expect(t.getTask("c2")).toBeUndefined();
    d.resolve(1);
    await first;
    expect(t.blockedBy("cleanup")).toBeUndefined();
  });

  it("restore blocks change but not perf", async () => {
    const d = deferred<number>();
    const p = t.runTask("r", { label: "R", where, group: "restore" }, () => d.promise);
    expect(t.blockedBy("change")).toBeDefined();
    expect(t.blockedBy("perf")).toBeUndefined();
    d.resolve(1);
    await p;
  });

  it("change blocks restore but not change", async () => {
    const d = deferred<number>();
    const p = t.runTask("x", { label: "X", where, group: "change" }, () => d.promise);
    expect(t.blockedBy("restore")).toBeDefined();
    expect(t.blockedBy("change")).toBeUndefined();
    d.resolve(1);
    await p;
  });

  it("blockedBy(undefined) is never blocked", () => {
    expect(t.blockedBy()).toBeUndefined();
  });
});

describe("observers", () => {
  it("runningSections contains a section only while its task runs", async () => {
    const d = deferred<number>();
    const p = t.runTask("u", { label: "U", where: { section: "updates" } }, () => d.promise);
    expect(t.runningSections().has("updates")).toBe(true);
    d.resolve(1);
    await p;
    expect(t.runningSections().has("updates")).toBe(false);
  });

  it("runningSections snapshot is stable until something changes", async () => {
    const a = t.runningSections();
    expect(t.runningSections()).toBe(a);
    const d = deferred<number>();
    const p = t.runTask("u", { label: "U", where: { section: "updates" } }, () => d.promise);
    const b = t.runningSections();
    expect(b).not.toBe(a);
    expect(t.runningSections()).toBe(b);
    d.resolve(1);
    await p;
  });

  it("onTaskFinished fires once per finish with the final task", async () => {
    const cb = vi.fn();
    const off = t.onTaskFinished(cb);
    await t.runTask("ok", { label: "OK", where, silent: true }, async () => 1);
    await t.runTask("bad", { label: "BAD", where }, async () => { throw new Error("x"); });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[0][0]).toMatchObject({ key: "ok", status: "done", silent: true });
    expect(cb.mock.calls[1][0]).toMatchObject({ key: "bad", status: "error" });
    off();
    await t.runTask("later", { label: "L", where }, async () => 1);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("restore then change: a change waits for a running restore point", async () => {
    const d = deferred<string>();
    const restore = t.runTask("restore:create", { label: "Restore point", where, group: "restore" }, () => d.promise);
    const fn = vi.fn(async () => "removed");
    expect(await t.runTask("bloat:remove", { label: "Bloatware removal", where, group: "change" }, fn)).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    d.resolve("ok");
    await restore;
    expect(await t.runTask("bloat:remove", { label: "Bloatware removal", where, group: "change" }, fn)).toBe("removed");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
