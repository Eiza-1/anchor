// Local-first profile: name/email live in a JSON file on THIS machine
// (%APPDATA%\Anchor\profile.json). Nothing is uploaded.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const file = () => path.join(app.getPath("userData"), "profile.json");

const DEFAULTS = {
  name: "",          // as supplied by the sign-in provider
  displayName: "",   // what the user chose to be called — takes precedence
  email: "",
  provider: "Local",
  mailWindowsUpdates: true,
  mailSystemHealth: true,
  mailTechNews: false,
  mailAnchorUpdates: true,
  // How often Anchor may create a System Restore point before a real system
  // change: "weekly" (default), "monthly", or "always".
  restorePolicy: "weekly",
  // Start with Windows and watch what else starts (see services/bootwatch.js)
  bootWatch: false,
  theme: "dark",
  // Dress the logo up for Halloween (see services/season.js).
  seasonalLogos: true,
  // Your own background picture, copied into userData (e.g. "background.jpg"); "" = theme picture.
  background: "",
};

function loadProfile() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(profile) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(profile, null, 2));
  return profile;
}

function saveProfile(profile) {
  return write({ ...loadProfile(), ...profile });
}

/** Deletes keys outright (e.g. 1.1.1's token, moved out by services/session.js). */
function removeKeys(keys) {
  const p = loadProfile();
  for (const k of keys) delete p[k];
  return write(p);
}

module.exports = { loadProfile, saveProfile, removeKeys };
