import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require_ = createRequire(import.meta.url);
const { createSessionStore, validToken, migrate } = require_("../main/services/session.js");

// Mirrors safeStorage's async API (the sync one is deprecated in Electron 45).
const fakeCrypto = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (s: string) => Buffer.from(Buffer.from(s, "utf8").toString("base64"), "utf8"),
  decryptStringAsync: async (b: Buffer) => ({
    result: Buffer.from(b.toString("utf8"), "base64").toString("utf8"),
    shouldReEncrypt: false,
  }),
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
  it("encrypts at rest", async () => {
    await createSessionStore({ file, crypto: fakeCrypto }).save(sess());
    expect(fs.readFileSync(file).toString("latin1")).not.toContain("SECRET-ACCESS-TOKEN");
  });

  it("round-trips", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    await store.save(sess());
    expect(await store.load()).toEqual(sess());
    expect(await createSessionStore({ file, crypto: fakeCrypto }).load()).toEqual(sess());
  });

  it("keeps session in memory when encryption unavailable", async () => {
    const store = createSessionStore({ file, crypto: { ...fakeCrypto, isAsyncEncryptionAvailable: async () => false } });
    await store.save(sess());
    expect(fs.existsSync(file)).toBe(false);
    expect(await store.load()).toEqual(sess());
  });

  it("clear removes the file and the memory copy", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    await store.save(sess());
    await store.clear();
    expect(fs.existsSync(file)).toBe(false);
    expect(await store.load()).toBeNull();
  });

  it("a clear right after a slow save leaves no file behind", async () => {
    const slow = { ...fakeCrypto, encryptStringAsync: (s: string) =>
      new Promise<Buffer>((r) => setTimeout(() => r(fakeCrypto.encryptStringAsync(s)), 20)) };
    const store = createSessionStore({ file, crypto: slow });
    void store.save(sess()); // not awaited: the clear is issued while it encrypts
    await store.clear();
    await new Promise((r) => setTimeout(r, 40)); // past the encrypt either way
    expect(fs.existsSync(file)).toBe(false);
    expect(await store.load()).toBeNull();
  });

  it("re-encrypts when the OS key rotated", async () => {
    await createSessionStore({ file, crypto: fakeCrypto }).save(sess());
    const encrypt = vi.fn(fakeCrypto.encryptStringAsync);
    const rotated = {
      ...fakeCrypto,
      encryptStringAsync: encrypt,
      decryptStringAsync: async (b: Buffer) => ({ ...(await fakeCrypto.decryptStringAsync(b)), shouldReEncrypt: true }),
    };
    const store = createSessionStore({ file, crypto: rotated });
    expect(await store.load()).toEqual(sess());
    await store.clear(); // queued behind the re-encrypt, so it has run
    expect(encrypt).toHaveBeenCalledTimes(1);
  });

  it("treats a corrupt file as signed out", async () => {
    fs.writeFileSync(file, "not base64 json !!");
    expect(await createSessionStore({ file, crypto: fakeCrypto }).load()).toBeNull();
  });
});

describe("validToken", () => {
  it("returns a fresh token as is", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    await store.save(sess({ expiresAt: 1_000_000 }));
    const refresh = vi.fn();
    expect(await validToken(store, refresh, 0)).toEqual(sess({ expiresAt: 1_000_000 }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired token", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    await store.save(sess({ expiresAt: 1000 }));
    const fresh = sess({ accessToken: "new", refreshToken: "r2", expiresAt: 9_999_999 });
    const refresh = vi.fn().mockResolvedValue(fresh);
    expect(await validToken(store, refresh, 5000)).toEqual(fresh);
    expect(refresh).toHaveBeenCalledWith("r1", "a@b.c"); // the email survives a refresh that omits the user
    expect(await store.load()).toEqual(fresh);
  });

  it("reports signed-out when refresh fails", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    await store.save(sess({ expiresAt: 1000 }));
    expect(await validToken(store, async () => null, 5000)).toBeNull();
    expect(await store.load()).toBeNull();
  });

  it("keeps the session when the refresh cannot be attempted", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    await store.save(sess({ expiresAt: 1000 }));
    await expect(validToken(store, async () => { throw new Error("offline"); }, 5000)).rejects.toThrow("offline");
    expect(await store.load()).toEqual(sess({ expiresAt: 1000 }));
  });

  it("returns null with no session", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    expect(await validToken(store, vi.fn(), 0)).toBeNull();
  });
});

describe("migrate", () => {
  const jwt = (payload: unknown) =>
    ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");
  const fakeProfile = (prof: any) => {
    const removeKeys = vi.fn((keys: string[]) => { for (const k of keys) delete prof[k]; });
    return { api: { loadProfile: () => ({ ...prof }), saveProfile: vi.fn(), removeKeys }, prof: () => prof };
  };

  it("migrates plaintext token", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    const token = jwt({ sub: "u9", exp: 2_000_000_000 });
    const { api, prof } = fakeProfile({ userId: "u9", email: "x@y.z", accessToken: token, theme: "dark" });
    await migrate(store, api);
    expect(await store.load()).toEqual({
      userId: "u9", email: "x@y.z", accessToken: token, refreshToken: "", expiresAt: 2_000_000_000_000,
    });
    expect(prof()).toEqual({ email: "x@y.z", theme: "dark" }); // keys deleted, not blanked
    expect(api.saveProfile).not.toHaveBeenCalled();
    await migrate(store, api);
    expect(api.removeKeys).toHaveBeenCalledTimes(1);
  });

  it("keeps a migrated token usable until its own expiry", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    const { api } = fakeProfile({ userId: "u9", email: "x@y.z", accessToken: jwt({ exp: 2_000 }) });
    await migrate(store, api);
    const refresh = vi.fn(async () => null);
    expect((await validToken(store, refresh, 1_000_000))?.accessToken).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("treats an undecodable token as expired", async () => {
    const store = createSessionStore({ file, crypto: fakeCrypto });
    const { api } = fakeProfile({ userId: "u9", email: "x@y.z", accessToken: "not-a-jwt" });
    await migrate(store, api);
    expect((await store.load()).expiresAt).toBe(0);
  });
});
