// anchor-img://fetch?u=<https url>: the news-picture proxy. Kept free of an
// Electron import (main.js injects net.fetch) so it can be unit-tested.
// The page picks the URL, so main must not become a way to reach the user's
// own machine or LAN: local/private targets and oversized bodies are refused.

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function privateV4(a, b) {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function privateV6(host) {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  // URL normalises ::ffff:1.2.3.4 to ::ffff:102:304 — judge the embedded IPv4.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    return privateV4(hi >> 8, hi & 255);
  }
  const first = parseInt(h.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80; // fc00::/7, fe80::/10
}

function isAllowedTarget(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.startsWith("[")) return !privateV6(host.slice(1, -1));
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) return !privateV4(Number(v4[1]), Number(v4[2]));
  return true;
}

async function proxyImage(req, fetchFn) {
  let target = new URL(req.url).searchParams.get("u") ?? "";
  if (!isAllowedTarget(target)) return new Response(null, { status: 400 });
  try {
    let res;
    // fetchFn must not follow redirects itself (see manualfetch.js): they are
    // followed here so every hop is checked, not just the first.
    for (let hop = 0; ; hop++) {
      res = await fetchFn(target, { headers: { "User-Agent": "Mozilla/5.0 Anchor" } });
      if (res.status < 300 || res.status >= 400) break;
      const loc = res.headers.get("location");
      if (!loc || hop >= MAX_REDIRECTS) return new Response(null, { status: 502 });
      target = new URL(loc, target).href;
      if (!isAllowedTarget(target)) return new Response(null, { status: 502 });
    }
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new Response(null, { status: 502 });
    const declared = Number(res.headers.get("content-length"));
    if (declared > MAX_BYTES) return new Response(null, { status: 502 });
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response(null, { status: 502 });
    return new Response(body, { headers: { "content-type": type, "access-control-allow-origin": "*" } });
  } catch {
    return new Response(null, { status: 502 });
  }
}

module.exports = { isAllowedTarget, proxyImage, MAX_BYTES };
