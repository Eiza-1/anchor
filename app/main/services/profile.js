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
  // Your own background picture, copied into userData (e.g. "background.jpg"); "" = theme picture.
  background: "",
  // Supabase session, kept so mail preferences can be saved to your account.
  userId: "",
  accessToken: "",
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
