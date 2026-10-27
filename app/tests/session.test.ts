import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require_ = createRequire(import.meta.url);
const { createSessionStore, validToken, migrate } = require_("../main/services/session.js");

const fakeCrypto = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(Buffer.from(s, "utf8").toString("base64"), "utf8"),
  decryptString: (b: Buffer) => Buffer.from(b.toString("utf8"), "base64").toString("utf8"),
};

const sess = (over = {}) => ({
  userId: "u1", email: "a@b.c", accessToken: "SECRET-ACCESS-TOKEN", refreshToken: "r1",
  expiresAt: 10_000_000, ...over,
});

let file: string;
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "anchor-sess-")), "session.bin");
});

describe("session store", () => {
  it("encrypts at rest", () => {
    createSessionStore({ file, crypto: fakeCrypto }).save(sess());
    expect(fs.readFileSync(file).toString("latin1")).not.toContain("SECRET-ACCESS-TOKEN");
  });

  it("round-trips", () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    store.save(sess());
    expect(store.load()).toEqual(sess());
    expect(createSessionStore({ file, crypto: fakeCrypto }).load()).toEqual(sess());
  });

  it("keeps session in memory when encryption unavailable", () => {
    const store = createSessionStore({ file, crypto: { ...fakeCrypto, isEncryptionAvailable: () => false } });
    store.save(sess());
    expect(fs.existsSync(file)).toBe(false);
    expect(store.load()).toEqual(sess());
  });

  it("clear removes the file and the memory copy", () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    store.save(sess());
    store.clear();
    expect(fs.existsSync(file)).toBe(false);
    expect(store.load()).toBeNull();
  });

  it("treats a corrupt file as signed out", () => {
    fs.writeFileSync(file, "not base64 json !!");
    expect(createSessionStore({ file, crypto: fakeCrypto }).load()).toBeNull();
  });
});

describe("validToken", () => {
  it("returns a fresh token as is", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    store.save(sess({ expiresAt: 1_000_000 }));
    const refresh = vi.fn();
    expect(await validToken(store, refresh, 0)).toEqual(sess({ expiresAt: 1_000_000 }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired token", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    store.save(sess({ expiresAt: 1000 }));
    const fresh = sess({ accessToken: "new", refreshToken: "r2", expiresAt: 9_999_999 });
    const refresh = vi.fn().mockResolvedValue(fresh);
    expect(await validToken(store, refresh, 5000)).toEqual(fresh);
    expect(refresh).toHaveBeenCalledWith("r1");
    expect(store.load()).toEqual(fresh);
  });

  it("reports signed-out when refresh fails", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    store.save(sess({ expiresAt: 1000 }));
    expect(await validToken(store, async () => null, 5000)).toBeNull();
    expect(store.load()).toBeNull();
  });

  it("returns null with no session", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    expect(await validToken(store, vi.fn(), 0)).toBeNull();
  });
});

describe("migrate", () => {
  it("migrates plaintext token", () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    let prof: any = { userId: "u9", email: "x@y.z", accessToken: "t" };
    const saveProfile = vi.fn((p) => { prof = { ...prof, ...p }; });
    const api = { loadProfile: () => prof, saveProfile };
    migrate(store, api);
    expect(store.load()).toEqual({
      userId: "u9", email: "x@y.z", accessToken: "t", refreshToken: "", expiresAt: 0,
    });
    expect(saveProfile).toHaveBeenCalledWith({ accessToken: "", userId: "" });
    migrate(store, api);
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });
});
