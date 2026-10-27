// The Supabase session (access + refresh token) lives only in the main process,
// encrypted with the OS key (Electron safeStorage / DPAPI). The renderer never
// sees it. Deps are passed in so this file has no Electron import and is testable.
const fs = require("fs");
const path = require("path");

/**
 * @param {{ file: string, crypto: { isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string } }} deps
 */
function createSessionStore({ file, crypto }) {
  let memory = null; // also the only copy when encryption is unavailable

  return {
    save(s) {
      memory = s;
      // Never write plaintext: without encryption the user simply signs in again next launch.
      if (!crypto.isEncryptionAvailable()) return;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, crypto.encryptString(JSON.stringify(s)));
      } catch { /* keep the in-memory copy */ }
    },
    load() {
      if (memory) return memory;
      try {
        if (!crypto.isEncryptionAvailable()) return null;
        const s = JSON.parse(crypto.decryptString(fs.readFileSync(file)));
        if (s && typeof s.accessToken === "string") memory = s;
      } catch { /* missing or unreadable file = signed out */ }
      return memory;
    },
    clear() {
      memory = null;
      try { fs.rmSync(file, { force: true }); } catch { /* nothing to remove */ }
    },
  };
}

/** A usable session, refreshed if it is within a minute of expiring; null = signed out (refused or nothing to refresh with); throws if the refresh could not be attempted. */
async function validToken(store, refresh, now = Date.now()) {
  const s = store.load();
  if (!s) return null;
  if (s.expiresAt - 60_000 > now) return s;
  // A throw (offline, 5xx) propagates with the store untouched: the refresh token is still good.
  const fresh = s.refreshToken ? await refresh(s.refreshToken) : null;
  if (!fresh) {
    store.clear();
    return null;
  }
  store.save(fresh);
  return fresh;
}

/** Moves a token that 1.1.1 left in profile.json into the store. Idempotent. */
function migrate(store, profile) {
  const p = profile.loadProfile();
  if (!p.accessToken) return;
  store.save({
    userId: p.userId ?? "", email: p.email ?? "", accessToken: p.accessToken,
    refreshToken: "", expiresAt: 0,
  });
  profile.saveProfile({ accessToken: "", userId: "" });
}

module.exports = { createSessionStore, validToken, migrate };
