// One Anchor per user, without a UAC prompt for a launch that only hands over.
//
// Anchor.exe runs asInvoker: a launch starts unelevated, and only when no
// Anchor is running does it relaunch itself elevated (the one UAC prompt).
// Electron's own single-instance handover can't reach an elevated Anchor from
// an unelevated launch — Windows (UIPI) drops the window message — so the
// running Anchor also listens on a loopback port, which UIPI doesn't touch.
// The port accepts one word, "show", and does nothing else.
const net = require("net");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { psQuote, runPS } = require("./ps");

const ELEVATED_FLAG = "--elevated";
const portFile = (userData) => path.join(userData, "instance.port");

/** True when this process has an elevated (High integrity) token. */
function isElevated() {
  return new Promise((resolve) => {
    execFile("whoami", ["/groups"], { windowsHide: true }, (err, out) =>
      resolve(!err && /S-1-16-(12288|16384)\b/.test(out)));
  });
}

/** Relaunches this exe elevated with `args`. Resolves false if UAC was declined. */
async function relaunchElevated(args) {
  const quote = psQuote;
  const argList = [...args, ELEVATED_FLAG].map(quote).join(",");
  const { code } = await runPS(`Start-Process -FilePath ${quote(process.execPath)} -Verb RunAs -ArgumentList @(${argList})`);
  return code === 0;
}

/** In the running Anchor: answer "show" from later launches. */
function listen(userData, onShow) {
  const server = net.createServer((sock) => {
    sock.setTimeout(2000, () => sock.destroy());
    sock.once("data", (d) => {
      if (d.toString().trim() === "show") onShow();
      sock.destroy();
    });
    sock.on("error", () => {});
  });
  server.on("error", () => {}); // without it a later launch just can't hand over
  server.listen(0, "127.0.0.1", () => {
    try { fs.writeFileSync(portFile(userData), String(server.address().port)); } catch {}
  });
  return server;
}

/** In a later launch: ask the running Anchor to show its window. */
function poke(userData) {
  return new Promise((resolve) => {
    let port;
    try { port = +fs.readFileSync(portFile(userData), "utf8"); } catch { return resolve(false); }
    if (!port) return resolve(false);
    const sock = net.connect({ port, host: "127.0.0.1" }, () => sock.end("show\n", () => resolve(true)));
    sock.setTimeout(2000, () => { sock.destroy(); resolve(false); });
    sock.on("error", () => resolve(false));
  });
}

module.exports = { ELEVATED_FLAG, isElevated, relaunchElevated, listen, poke };
