// electron-builder afterPack hook: scans the app.asar it just packed, for every
// arch, and throws on any secret or source map. electron-builder runs this
// before making installers and before publishing, so `npm run release` can't
// upload an artifact the scanner hasn't passed. (The scan of dist/ and main/
// in the npm scripts checks the inputs; this checks what actually ships.)
const path = require("path");
const { scanPaths } = require("./scan-artifacts");

module.exports = async function afterPack(context) {
  const asar = path.join(context.appOutDir, "resources", "app.asar");
  const { problems, scanned } = scanPaths([asar]);
  if (problems.length) {
    throw new Error(`Release gate: ${problems.length} problem(s) in ${asar}\n${problems.join("\n")}`);
  }
  if (scanned === 0) throw new Error(`Release gate: nothing scanned in ${asar}`);
  console.log(`  • release gate  OK: no secrets or source maps in ${scanned} file(s) of ${asar}`);
};
