// Supabase settings, loaded once for every main-process user (auth, games,
// main.js). They live in main/config.js, which is gitignored; a clone falls
// back to config.example.js, whose YOUR_ placeholders mean "not configured".
// See docs/SUPABASE_SETUP.md. No Electron import so it can be unit-tested.
let config;
try {
  config = require("../config");
} catch {
  config = require("../config.example");
}

const SUPABASE_URL = config.supabaseUrl ?? "";
const SUPABASE_ANON_KEY = config.supabaseAnonKey ?? "";

// Providers offered in the UI. Enable the matching ones in the Supabase dashboard.
const PROVIDERS = config.providers ?? ["google", "github"];

/** True for a missing value or one still holding the example's YOUR_ placeholder. */
const isPlaceholder = (v) => !v || String(v).includes("YOUR_");

const isConfigured = () => !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON_KEY);

module.exports = { SUPABASE_URL, SUPABASE_ANON_KEY, PROVIDERS, isPlaceholder, isConfigured };
