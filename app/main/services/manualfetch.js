// A fetch-shaped wrapper over Electron's net.request that does NOT follow
// redirects: it answers the 3xx with its Location header so the caller can
// vet each hop. (net.fetch with redirect:"manual" throws "Redirect was
// cancelled" in Electron instead of returning the 3xx.) `net` is injected so
// this file has no Electron import.

function createManualFetch(net, maxBytes) {
  return (url, init = {}) =>
    new Promise((resolve, reject) => {
      const request = net.request({ url, redirect: "manual" });
      for (const [k, v] of Object.entries(init.headers ?? {})) request.setHeader(k, v);
      let settled = false;
      const done = (fn, val) => { if (!settled) { settled = true; fn(val); } };
      request.on("redirect", (status, _method, redirectUrl) => {
        done(resolve, new Response(null, { status, headers: { location: redirectUrl } }));
        request.abort();
      });
      request.on("response", (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          chunks.push(c);
          size += c.length;
          if (size > maxBytes) { finish(); request.abort(); } // one byte over is enough for the caller to refuse
        });
        res.on("end", finish);
        res.on("error", (e) => done(reject, e));
        function finish() {
          // 204/304 etc. may not carry a body
          const body = [204, 205, 304].includes(res.statusCode) ? null : Buffer.concat(chunks);
          done(resolve, new Response(body, { status: res.statusCode, headers }));
        }
      });
      request.on("error", (e) => done(reject, e));
      request.on("abort", () => done(reject, new Error("aborted")));
      request.end();
    });
}

module.exports = { createManualFetch };
