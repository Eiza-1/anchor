// The Supabase session (access + refresh token) lives only in the main process,
// encrypted with the OS key (Electron safeStorage / DPAPI). The renderer never
// sees it. Deps are passed in so this file has no Electron import and is testable.
const fs = require("fs");
const path = require("path");

/**
 * Uses safeStorage's async API: the sync one is deprecated in Electron 45 and
 * removed in 46. Files written by the sync encryptString decrypt fine with it.
 * @param {{ file: string, crypto: { isAsyncEncryptionAvailable(): Promise<boolean>, encryptStringAsync(s: string): Promise<Buffer>, decryptStringAsync(b: Buffer): Promise<{ result: string, shouldReEncrypt: boolean }> } }} deps
 */
function createSessionStore({ file, crypto }) {
  let memory = null; // also the only copy when encryption is unavailable
  // File writes and removals run one at a time, in call order, so a slow
  // encrypt can't land after a later save or resurrect the file after clear().
  let queue = Promise.resolve();
  const enqueue = (fn) => (queue = queue.then(fn, fn));

  const write = (s) => enqueue(async () => {
    // Never write plaintext: without encryption the user simply signs in again next launch.
    try {
      if (!(await crypto.isAsyncEncryptionAvailable())) return;
      const data = await crypto.encryptStringAsync(JSON.stringify(s));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
    } catch { /* keep the in-memory copy */ }
  });

  return {
    save(s) {
      memory = s;
      return write(s);
    },
    async load() {
      if (memory) return memory;
      await queue; // a pending clear() or save() decides what's on disk
      if (memory) return memory;
      try {
        if (!(await crypto.isAsyncEncryptionAvailable())) return null;
        const { result, shouldReEncrypt } = await crypto.decryptStringAsync(fs.readFileSync(file));
        const s = JSON.parse(result);
        if (s && typeof s.accessToken === "string" && !memory) {
          memory = s;
          if (shouldReEncrypt) write(s); // the OS key rotated; store it under the new one
        }
      } catch { /* missing or unreadable file = signed out */ }
      return memory;
    },
    clear() {
      memory = null;
      return enqueue(() => {
        try { fs.rmSync(file, { force: true }); } catch { /* nothing to remove */ }
      });
    },
  };
}

/** A usable session, refreshed if it is within a minute of expiring; null = signed out (refused or nothing to refresh with); throws if the refresh could not be attempted. */
async function validToken(store, refresh, now = Date.now()) {
  const s = await store.load();
  if (!s) return null;
  if (s.expiresAt - 60_000 > now) return s;
  // A throw (offline, 5xx) propagates with the store untouched: the refresh token is still good.
  const fresh = s.refreshToken ? await refresh(s.refreshToken) : null;
  if (!fresh) {
    await store.clear();
    return null;
  }
  await store.save(fresh);
  return fresh;
}

/** Moves a token that 1.1.1 left in profile.json into the store. Idempotent. */
async function migrate(store, profile) {
  const p = profile.loadProfile();
  if (!p.accessToken) return;
  await store.save({
    userId: p.userId ?? "", email: p.email ?? "", accessToken: p.accessToken,
    refreshToken: "", expiresAt: 0,
  });
  profile.saveProfile({ accessToken: "", userId: "" });
}

module.exports = { createSessionStore, validToken, migrate };
