// Copy this file to  main/config.js  and fill in your own values.
// config.js is gitignored, so your project's settings never enter the repo.
// See docs/SUPABASE_SETUP.md for where these come from.
module.exports = {
  // Supabase → Settings → API → Project URL
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",

  // Supabase → Settings → API → anon / public key.
  // This key is designed to be public (every Supabase web app ships it in its
  // JavaScript) — it is NOT the service_role key, which must never be used here.
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",

  // Sign-in providers to show. Enable the matching ones in the Supabase dashboard.
  providers: ["google", "github", "azure", "discord"],
};
