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

/** What the file really is, from its first 12 bytes — the extension alone
 *  would accept a renamed non-picture, which then shows as a blank background. */
function imageKind(head) {
  const b = Buffer.from(head ?? []);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

function readHead(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(12);
    return head.subarray(0, fs.readSync(fd, head, 0, 12, 0));
  } finally {
    fs.closeSync(fd);
  }
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
  let kind = null;
  try { kind = imageKind(readHead(src)); } catch { return { ok: false, message: "Couldn't read that picture." }; }
  if (!kind) return { ok: false, message: "That file isn't a PNG, JPG or WebP picture." };
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

/** The saved background's bytes and type, or null when there is none (or it
 *  went missing). Raw bytes cross IPC smaller than a base64 data: URL; the
 *  renderer shows them through a short blob: URL. */
async function getBackground() {
  const name = profile().loadProfile().background;
  if (!name || !SAVED_NAME.test(name)) return null;
  try {
    const bytes = await fs.promises.readFile(path.join(userDir(), name));
    return { type: MIME[path.extname(name).toLowerCase()], bytes };
  } catch {
    return null;
  }
}

function resetBackground() {
  removeSaved(null);
  profile().saveProfile({ background: "" });
}

module.exports = { validateBackground, imageKind, setBackgroundFrom, pickBackground, getBackground, resetBackground };
