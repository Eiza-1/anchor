// Checks GitHub Releases for a newer Anchor. Transparent by design: one anonymous
// GET to the public GitHub API, no telemetry, nothing sent about the user.
// To ship an update: bump "version" in package.json, build, then publish a GitHub
// release tagged v0.4.0 (etc.) with the installers attached.
const { app } = require("electron");

const REPO_OWNER = "Eiza-1";
const REPO_NAME = "anchor";

const parseVersion = (s) => {
  const m = String(s).replace(/^v\.?/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
};
const isNewer = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

async function checkForUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
      headers: { "User-Agent": "Anchor-Update-Check", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const rel = await res.json();

    const latest = parseVersion(rel.tag_name);
    const current = parseVersion(app.getVersion());
    if (!latest || !current) return null;
    if (!isNewer(latest, current)) return { available: false };

    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const asset = (rel.assets ?? []).find(
      (a) => /setup/i.test(a.name) && a.name.toLowerCase().includes(arch)
    );
    const notes = (rel.body ?? "").slice(0, 300);
    return {
      available: true,
      latestVersion: latest.join("."),
      currentVersion: current.join("."),
      releaseUrl: rel.html_url,
      installerUrl: asset?.browser_download_url ?? null,
      notes,
    };
  } catch {
    return null; // offline / rate-limited — never bother the user about it
  }
}

module.exports = { checkForUpdate };
