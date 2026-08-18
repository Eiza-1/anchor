// PowerShell runner. Every system command Anchor executes goes through here,
// so auditing the app's system actions means auditing calls to this module.
//
// Note: an earlier attempt kept one long-lived PowerShell host alive to avoid
// process-start cost. It broke multi-line scripts (they arrive over stdin a line
// at a time), so we're back to one process per call — reliable, and the caching
// layer in the renderer is what actually keeps the UI feeling instant.
const { spawn } = require("child_process");

function runPS(command) {
  return new Promise((resolve) => {
    const p = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true }
    );
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.on("error", () => resolve({ code: -1, out: "", err: "PowerShell could not be started." }));
  });
}

async function runPSJson(command) {
  const { out } = await runPS(command);
  if (!out) return null;
  // A cmdlet may print a warning before the JSON — start at the first { or [.
  const start = out.search(/[[{]/);
  if (start === -1) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

/** Pays the PowerShell start-up cost once at launch, off the critical path. */
function warmUp() {
  runPS("$null = 1").catch(() => {});
}

function shutdown() {}

module.exports = { runPS, runPSJson, warmUp, shutdown };
