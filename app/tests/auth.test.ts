import { createRequire } from "module";
import { afterEach, describe, expect, it, vi } from "vitest";

// auth.js reads services/config.js at require time; give it a configured
// project so the tests never depend on the developer's own (gitignored) config.
const require = createRequire(import.meta.url);
const cfgPath = require.resolve("../main/services/config.js");
const real = require(cfgPath);
require.cache[cfgPath]!.exports = {
  ...real, SUPABASE_URL: "https://proj.supabase.co", SUPABASE_ANON_KEY: "anon", isConfigured: () => true,
};
delete require.cache[require.resolve("../main/services/auth.js")];
const auth = require("../main/services/auth.js") as {
  refreshSession(token: string, prevEmail?: string): Promise<{ email: string; accessToken: string } | null>;
};
require.cache[cfgPath]!.exports = real;

const reply = (status: number, body: unknown) =>
  vi.fn(async () => ({ ok: status < 300, status, json: async () => body }));

afterEach(() => vi.unstubAllGlobals());

describe("refreshSession", () => {
  it("keeps the previous email when the response has no user", async () => {
    vi.stubGlobal("fetch", reply(200, { access_token: "a2", refresh_token: "r2", expires_in: 3600 }));
    expect(await auth.refreshSession("r1", "a@b.c")).toMatchObject({ email: "a@b.c", accessToken: "a2" });
  });

  it("prefers the email Supabase returns", async () => {
    vi.stubGlobal("fetch", reply(200, { access_token: "a2", user: { id: "u", email: "new@b.c" } }));
    expect(await auth.refreshSession("r1", "a@b.c")).toMatchObject({ email: "new@b.c" });
  });

  it("returns null when Supabase refuses the token", async () => {
    vi.stubGlobal("fetch", reply(400, {}));
    expect(await auth.refreshSession("r1", "a@b.c")).toBeNull();
  });
});
