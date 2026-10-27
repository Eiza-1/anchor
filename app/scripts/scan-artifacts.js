// Release gate: refuses to let a secret or a source map ship. `npm run release`
// runs it over dist/ and main/ (what electron-builder packs into app.asar)
// before packing, and scripts/after-pack.js runs it on every packed app.asar
// before anything is published. It also works by hand on a built app.asar.
// Findings are redacted to 6 characters so the output is safe to paste anywhere.
const fs = require("fs");
const os = require("os");
const path = require("path");

const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*/g;

const RULES = [
  { rule: "stripe-key", re: /sk_(?:live|test)_[A-Za-z0-9]+/g },
  { rule: "aws-access-key", re: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g },
  { rule: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { rule: "github-token", re: /(?:ghp_|github_pat_)[A-Za-z0-9_]+/g },
  { rule: "postgres-url", re: /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/g },
  { rule: "rawg-key", re: /rawgKey/g },
  // A bare 32-hex string is common (hashes), so only flag it next to a key-like name.
  { rule: "hex-secret", re: /(?:key|secret|token)[^\n]{0,20}?[^0-9a-fA-F]([0-9a-fA-F]{32})(?![0-9a-fA-F])/gi, group: 1 },
];

const redact = (s) => s.slice(0, 6);

function scanText(text) {
  const findings = [];
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
      // The anon key is public by design; only the privileged role is a leak.
      if (payload && payload.role === "service_role") {
        findings.push({ rule: "service-role-jwt", match: redact(m[0]) });
      }
    } catch {
      /* not a real JWT */
    }
  }
  for (const { rule, re, group = 0 } of RULES) {
    for (const m of text.matchAll(re)) findings.push({ rule, match: redact(m[group]) });
  }
  return findings;
}

function walk(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) walk(path.join(p, name), out);
  } else {
    out.push(p);
  }
}

function scanPaths(targets) {
  const problems = [];
  const tmpDirs = [];
  let scanned = 0;
  const scanFile = (file, label) => {
    if (file.endsWith(".map")) problems.push(`${label}: source map present`);
    let text;
    try {
      text = fs.readFileSync(file, "latin1");
    } catch (e) {
      problems.push(`${label}: unreadable (${e.code || e.message})`);
      return;
    }
    scanned++;
    for (const f of scanText(text)) problems.push(`${label}: ${f.rule} (${f.match}...)`);
  };
  try {
    for (const target of targets) {
      const files = [];
      walk(target, files);
      for (const file of files) {
        if (path.basename(file) === "app.asar") {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anchor-scan-"));
          tmpDirs.push(dir);
          require("@electron/asar").extractAll(file, dir);
          const inner = [];
          walk(dir, inner);
          for (const f of inner) scanFile(f, `${file}!/${path.relative(dir, f)}`);
        } else {
          scanFile(file, file);
        }
      }
    }
  } finally {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  }
  return { problems, scanned };
}

if (require.main === module) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error("usage: node scripts/scan-artifacts.js <dir|file>...");
    process.exit(2);
  }
  const { problems, scanned } = scanPaths(targets);
  if (problems.length) {
    console.error(problems.join("\n"));
    console.error(`FAIL: ${problems.length} problem(s) in ${scanned} file(s)`);
    process.exit(1);
  }
  console.log(`OK: no secrets or source maps in ${scanned} file(s)`);
}

module.exports = { scanText, scanPaths };
