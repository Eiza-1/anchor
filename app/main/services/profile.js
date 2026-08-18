// Local-first profile: name/email live in a JSON file on THIS machine
// (%APPDATA%\Anchor\profile.json). Nothing is uploaded.
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const file = () => path.join(app.getPath("userData"), "profile.json");

const DEFAULTS = {
  name: "",
  email: "",
  provider: "Local",
  mailWindowsUpdates: true,
  mailSystemHealth: true,
  mailTechNews: false,
  mailAnchorUpdates: true,
};

function loadProfile() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveProfile(profile) {
  const merged = { ...loadProfile(), ...profile };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { loadProfile, saveProfile };
