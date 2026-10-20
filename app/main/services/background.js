// The user's own background picture. The chosen file is copied into userData,
// so moving or deleting the original afterwards changes nothing. Electron and
// the profile service are required lazily so validateBackground can be tested
// without Electron.
const fs = require("fs");
const path = require("path");

const EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const MAX_BYTES = 15 * 1024 * 1024;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const SAVED_NAME = /^background\.(png|jpe?g|webp)$/i;

/** Returns an error message, or null when the file is acceptable. */
function validateBackground(file, sizeBytes) {
  const ext = path.extname(String(file ?? "")).toLowerCase();
  if (!EXTS.includes(ext)) return "Pick a PNG, JPG or WebP picture.";
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "Couldn't read that picture.";
  if (sizeBytes > MAX_BYTES) return "That picture is over 15 MB. Pick a smaller one.";
  return null;
}

const userDir = () => require("electron").app.getPath("userData");
const profile = () => require("./profile");

function removeSaved(except) {
  let names = [];
  try { names = fs.readdirSync(userDir()); } catch { return; }
  for (const n of names) {
    if (SAVED_NAME.test(n) && n !== except) {
      try { fs.unlinkSync(path.join(userDir(), n)); } catch { /* in use or gone */ }
    }
  }
}

/** Copies `src` into userData as the background. Exported for testing without a dialog. */
function setBackgroundFrom(src) {
  let size;
  try { size = fs.statSync(src).size; } catch { return { ok: false, message: "Couldn't read that picture." }; }
  const err = validateBackground(src, size);
  if (err) return { ok: false, message: err };
  const name = "background" + path.extname(src).toLowerCase();
  const dest = path.join(userDir(), name);
  try {
    fs.mkdirSync(userDir(), { recursive: true });
    if (path.resolve(src).toLowerCase() !== path.resolve(dest).toLowerCase()) {
      const tmp = dest + ".tmp";
      fs.copyFileSync(src, tmp);
      fs.renameSync(tmp, dest);
    }
  } catch (e) {
    return { ok: false, message: `Couldn't save that picture: ${e.message}` };
  }
  removeSaved(name);
  profile().saveProfile({ background: name });
  return { ok: true };
}

async function pickBackground(win) {
  const { dialog } = require("electron");
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Choose a background picture",
    filters: [{ name: "Pictures", extensions: ["png", "jpg", "jpeg", "webp"] }],
    properties: ["openFile"],
  });
  if (canceled || !filePaths?.length) return { ok: false, message: "Cancelled." };
  return setBackgroundFrom(filePaths[0]);
}

/** The saved background as a data: URL, or null when there is none (or it went missing). */
async function getBackground() {
  const name = profile().loadProfile().background;
  if (!name || !SAVED_NAME.test(name)) return null;
  try {
    const buf = await fs.promises.readFile(path.join(userDir(), name));
    return `data:${MIME[path.extname(name).toLowerCase()]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function resetBackground() {
  removeSaved(null);
  profile().saveProfile({ background: "" });
}

module.exports = { validateBackground, setBackgroundFrom, pickBackground, getBackground, resetBackground };
