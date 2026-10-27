// Picks the icon baked into a release — the .exe, its shortcuts and pinned
// taskbar icon, the installer and uninstaller. Windows can't change those after
// the build, so a release built during an active season (services/season.js)
// wears that season's logo, and one built on an ordinary day wears the normal
// one. Runs before electron-builder; writes build/release-icon.ico.
const fs = require("fs");
const path = require("path");
const { seasonFor } = require("../main/services/season");

const ICONS = path.join(__dirname, "..", "main", "assets", "icons");
const OUT = path.join(__dirname, "..", "build", "release-icon.ico");

function iconFor(date) {
  const season = seasonFor(date);
  return path.join(ICONS, `anchor${season ? `-${season}` : ""}.ico`);
}

if (require.main === module) {
  const src = iconFor(new Date());
  fs.copyFileSync(src, OUT);
  console.log(`Release icon: ${path.basename(src)}`);
}

module.exports = { iconFor };
