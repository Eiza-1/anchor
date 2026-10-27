import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isAllowedTarget, proxyImage, MAX_BYTES } = require("../main/services/imgproxy.js") as {
  isAllowedTarget(url: string): boolean;
  proxyImage(req: Request, fetchFn: (url: string, init?: object) => Promise<Response>): Promise<Response>;
  MAX_BYTES: number;
};

const req = (u: string) => new Request(`anchor-img://fetch?u=${encodeURIComponent(u)}`);
const png = (init: ResponseInit = {}) =>
  new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" }, ...init });

describe("isAllowedTarget", () => {
  it("allows public https", () => {
    expect(isAllowedTarget("https://example.com/a.png")).toBe(true);
    expect(isAllowedTarget("https://172.32.0.1/a.png")).toBe(true);
  });
  it("refuses non-https and garbage", () => {
    expect(isAllowedTarget("http://example.com/a.png")).toBe(false);
    expect(isAllowedTarget("not a url")).toBe(false);
  });
  it("refuses local and private targets", () => {
    for (const u of [
      "https://localhost/x.png",
      "https://img.localhost/x.png",
      "https://127.0.0.1/x.png",
      "https://10.1.2.3/x.png",
      "https://172.16.0.1/x.png",
      "https://172.31.255.1/x.png",
      "https://192.168.1.2/x.png",
      "https://169.254.169.254/x.png",
      "https://0.0.0.0/x.png",
      "https://[::1]/x.png",
      "https://[fc00::1]/x.png",
      "https://[fd12::1]/x.png",
      "https://[fe80::1]/x.png",
      "https://[::ffff:127.0.0.1]/x.png",
    ]) expect(isAllowedTarget(u), u).toBe(false);
  });
  it("refuses numeric IPv4 tricks via URL normalisation", () => {
    expect(isAllowedTarget("https://2130706433/")).toBe(false);
  });
});

describe("proxyImage", () => {
  it("returns the image with CORS header", async () => {
    const res = await proxyImage(req("https://example.com/a.png"), async () => png());
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("content-type")).toBe("image/png");
  });
  it("400 for refused targets without fetching", async () => {
    let called = false;
    const f = async () => ((called = true), png());
    for (const u of ["http://example.com/a.png", "https://localhost/x.png", "https://127.0.0.1/x.png", "https://192.168.1.2/x.png", "https://[::1]/x.png"]) {
      expect((await proxyImage(req(u), f)).status, u).toBe(400);
    }
    expect(called).toBe(false);
  });
  it("502 for non-images", async () => {
    const res = await proxyImage(req("https://example.com/a"), async () => new Response("x", { headers: { "content-type": "text/html" } }));
    expect(res.status).toBe(502);
  });
  it("502 for oversize content-length", async () => {
    const res = await proxyImage(req("https://example.com/a.png"), async () => png({ headers: { "content-type": "image/png", "content-length": String(MAX_BYTES + 1) } }));
    expect(res.status).toBe(502);
  });
  it("502 for oversize body without content-length", async () => {
    const big = new Uint8Array(MAX_BYTES + 1);
    const res = await proxyImage(req("https://example.com/a.png"), async () => new Response(big, { headers: { "content-type": "image/png" } }));
    expect(res.status).toBe(502);
  });
  it("refuses a redirect to a private address", async () => {
    const f = async (u: string) =>
      u.startsWith("https://example.com")
        ? new Response(null, { status: 302, headers: { location: "https://127.0.0.1/x.png" } })
        : png();
    expect((await proxyImage(req("https://example.com/a.png"), f)).status).toBe(502);
  });
  it("follows a redirect to a public address", async () => {
    const f = async (u: string) =>
      u.startsWith("https://example.com")
        ? new Response(null, { status: 302, headers: { location: "https://cdn.example.net/x.png" } })
        : png();
    expect((await proxyImage(req("https://example.com/a.png"), f)).status).toBe(200);
  });
});
