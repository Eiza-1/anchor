/* ==========================================================================
   Anchor website: every word, feature, link and number lives here.
   Edit this file to change the site; main.js only reads it.
   ========================================================================== */
window.ANCHOR = {
  repo: { owner: "Eiza-1", name: "anchor" },
  links: {
    github: "https://github.com/Eiza-1/anchor",
    releases: "https://github.com/Eiza-1/anchor/releases",
    latest: "https://github.com/Eiza-1/anchor/releases/latest",
    license: "https://github.com/Eiza-1/anchor/blob/main/LICENSE",
  },

  /* Which release asset each button downloads. Matched against the latest release's files. */
  assets: {
    installer: /^AnchorSetup-[\d.]+\.exe$/,
    zipX64: /^Anchor-[\d.]+-win\.zip$/,
    zipArm64: /^Anchor-[\d.]+-arm64-win\.zip$/,
  },

  /* The depth gauge: one stop per section, top to bottom. */
  depths: [
    { id: "surface", name: "Surface", m: 0 },
    { id: "drag", name: "The drag", m: 100 },
    { id: "cut", name: "The cut", m: 300 },
    { id: "demo", name: "Live demo", m: 500 },
    { id: "open", name: "Open waters", m: 700 },
    { id: "sonar", name: "Sonar", m: 850 },
    { id: "seabed", name: "Seabed", m: 1000 },
  ],

  hero: {
    title: "Your PC is carrying dead weight.",
    sub: "Anchor is a free, open-source Windows optimizer. It explains every change it makes and creates a restore point before touching anything.",
    drop: "Drop anchor",
    github: "View on GitHub",
    /* The junk drifting on the surface. Invented, never a real product. */
    junk: [
      { kind: "scare", text: "YOUR PC IS SLOW!", detail: "1,284 problems found. Fix now?" },
      { kind: "toast", text: "UpdateHelper", detail: "A new helper wants to start with Windows." },
      { kind: "tile", text: "QuickLaunch Pro" },
      { kind: "toast", text: "MegaCleaner Free", detail: "Upgrade to keep your PC clean." },
      { kind: "bar", text: "SearchBuddy Toolbar" },
      { kind: "tile", text: "SyncAgent" },
      { kind: "scare", text: "WARNING", detail: "Registry errors detected!!" },
      { kind: "toast", text: "Telemetry Service", detail: "Sending usage data…" },
      { kind: "tile", text: "GameBar Plus" },
      { kind: "toast", text: "PromoCenter", detail: "Today only: 70% off!" },
      { kind: "tile", text: "Updater (3)" },
      { kind: "bar", text: "Free Coupons Bar" },
      { kind: "toast", text: "CloudBackup Trial", detail: "Your trial ends in 2 days." },
      { kind: "tile", text: "Helper.exe" },
      { kind: "scare", text: "DRIVER ALERT", detail: "47 drivers out of date" },
      { kind: "toast", text: "News & Weather", detail: "Starting in background" },
    ],
  },

  drag: {
    title: "Every extra makes the boot heavier.",
    sub: "Switch the extras on and off and watch a simulated PC react. A lot of what slows Windows down starts by itself, quietly, every time you log in.",
    label: "Simulation — illustrative numbers, not a scan of your PC.",
    base: { boot: 14, ram: 2.4, cpu: 6 },
    items: [
      { id: "startup", name: "Startup apps", detail: "11 apps launching at login", boot: 21, ram: 1.6, cpu: 9, on: true },
      { id: "services", name: "Background services", detail: "Updaters and helpers that never stop", boot: 6, ram: 0.9, cpu: 7, on: true },
      { id: "telemetry", name: "Telemetry", detail: "Diagnostic data collection and ad tracking", boot: 3, ram: 0.3, cpu: 4, on: true },
      { id: "temp", name: "Temp-file buildup", detail: "26 GB of caches and leftovers", boot: 4, ram: 0, cpu: 2, on: true },
      { id: "bloat", name: "Preinstalled apps", detail: "Trials, games and promos you never opened", boot: 5, ram: 0.7, cpu: 3, on: true },
    ],
  },

  cut: {
    title: "What Anchor actually changes.",
    sub: "No mystery “optimise” button. Each module says what it touches, in Windows’ own terms, and every tweak can be switched back.",
    label: "Example readouts. Your numbers will differ.",
    modules: [
      {
        name: "Cleanup", before: "26.4 GB", after: "1.1 GB", unit: "reclaimable",
        what: "Deletes temp files, Windows Update and Delivery Optimization downloads, crash dumps, error reports and the system internet cache. One-click Boost on Home runs these defaults.",
        path: "%TEMP%  ·  C:\\Windows\\SoftwareDistribution\\Download",
      },
      {
        name: "Game & App Boost", before: "Off", after: "On", unit: "Game Mode",
        what: "Reversible tweaks that each name the value they change: Game Mode, background Game DVR, fullscreen and windowed-game optimizations, variable refresh rate, GPU scheduling, background apps, animations.",
        path: "HKCU\\Software\\Microsoft\\GameBar  ·  AutoGameModeEnabled = 1",
      },
      {
        name: "Power", before: "Balanced", after: "Ultimate", unit: "power plan",
        what: "Switches power plans, including the hidden Ultimate Performance plan, and PCIe link power management.",
        path: "powercfg /setactive  ·  PCI Express → Link State Power Management",
      },
      {
        name: "Startup", before: "11", after: "3", unit: "apps at login",
        what: "Lists everything that starts with Windows and lets you turn it off. Boot Watch flags suspicious processes and scripts that run at login.",
        path: "HKCU\\…\\CurrentVersion\\Run  ·  Startup folder  ·  Scheduled tasks",
      },
      {
        name: "Debloat", before: "34", after: "12", unit: "preinstalled apps",
        what: "Removes preinstalled apps in a batch, and turns off telemetry, ad tracking and data collection with toggles you can read.",
        path: "Get-AppxPackage … | Remove-AppxPackage  ·  AllowTelemetry = 0",
      },
      {
        name: "Drive health", before: "Unknown", after: "Healthy · 41 °C", unit: "S.M.A.R.T.",
        what: "Early warnings for wear, temperature and predicted failure from S.M.A.R.T. data, plus a disk speed test and low-space alerts.",
        path: "Get-PhysicalDisk  ·  Get-StorageReliabilityCounter  ·  MSStorageDriver_FailurePredictStatus",
      },
      {
        name: "Health Check", before: "One by one", after: "All at once", unit: "tests",
        what: "Runs every test at once: Windows build, pending updates, drive health, disk space, Device Manager faults, and live CPU, memory and disk pressure. Advice in plain language.",
        path: "Win32_PnPEntity.ConfigManagerErrorCode  ·  Get-Counter",
      },
    ],
    safety: {
      title: "Restore point first.",
      lines: [
        "Anchor creates a System Restore point before a system change: weekly by default, or before every change if you set it in Account.",
        "Tweaks switch back one at a time. App removals are covered by the restore point.",
        "Every system command lives in one folder, app/main/services/. Audit that folder and you’ve audited the app.",
      ],
      readout: "Restore point created ✓",
    },
  },

  demo: {
    title: "Try it in your browser.",
    sub: "A working copy of Anchor’s window. Click around, flip tweaks, press Apply.",
    label: "Demo — nothing here touches your PC.",
    nav: [
      { id: "home", label: "Home" },
      { id: "spotlight", label: "Tech Spotlight" },
      { id: "update", label: "Windows Update" },
      { id: "cleanup", label: "Cleanup" },
      { group: "Optimize" },
      { id: "performance", label: "Performance" },
      { id: "startup", label: "Startup" },
      { id: "debloat", label: "Debloat" },
      { id: "system", label: "System" },
    ],
    /* Invented games for the Home rail. */
    releases: [
      { title: "Tidewright", day: 2, mon: "Nov", hue: 200 },
      { title: "Lantern Deep", day: 5, mon: "Nov", hue: 28 },
      { title: "Hollow Reef", day: 9, mon: "Nov", hue: 160 },
      { title: "Iron Meridian", day: 14, mon: "Nov", hue: 260 },
      { title: "Saltbound", day: 19, mon: "Nov", hue: 340 },
    ],
    cleanup: [
      { name: "Temporary files", size: "8.2 GB", on: true },
      { name: "Windows Update downloads", size: "11.6 GB", on: true },
      { name: "Delivery Optimization files", size: "3.9 GB", on: true },
      { name: "Crash dumps and error reports", size: "2.1 GB", on: true },
      { name: "System internet cache", size: "610 MB", on: true },
    ],
    performance: [
      { name: "Game Mode", value: "AutoGameModeEnabled = 1", on: false },
      { name: "Background Game DVR", value: "AppCaptureEnabled = 0", on: false },
      { name: "Hardware-accelerated GPU scheduling", value: "HwSchMode = 2", on: false },
      { name: "Variable refresh rate", value: "VRROptimizeEnable = 1", on: false },
      { name: "Background apps", value: "GlobalUserDisabled = 1", on: false },
    ],
    startup: [
      { name: "UpdateHelper", impact: "High", on: true },
      { name: "CloudBackup Trial", impact: "High", on: true },
      { name: "PromoCenter", impact: "Medium", on: true },
      { name: "GameBar Plus", impact: "Medium", on: true },
      { name: "Audio driver tray", impact: "Low", on: true },
    ],
    debloat: [
      { name: "Limit diagnostic data (telemetry)", value: "AllowTelemetry = 0", on: false },
      { name: "Advertising ID", value: "Enabled = 0", on: false },
      { name: "Tailored experiences", value: "TailoredExperiencesWithDiagnosticDataEnabled = 0", on: false },
      { name: "Start menu web suggestions", value: "DisableSearchBoxSuggestions = 1", on: false },
    ],
  },

  open: {
    title: "Open waters.",
    sub: "All of Anchor is on GitHub. Read it, build it, change it.",
    terminal: [
      "git clone https://github.com/Eiza-1/anchor.git",
      "cd anchor/app",
      "npm install",
      "npm run dev",
    ],
    terminalNote: "Needs Node.js 20+. No Visual Studio, no .NET, no WebView2.",
    manifesto: [
      "Free, and MIT-licensed. No ads, no upsells, no “pro” tier.",
      "Local-first. Your profile stays on your PC and nothing phones home.",
      "Sign-in is optional and only used for email updates. It happens in your own browser; Anchor never sees your password.",
    ],
  },

  faq: [
    { q: "Is it safe?", a: "Anchor creates a System Restore point before a system change, and every command it can run is in one folder, app/main/services/, so you can read exactly what it does." },
    { q: "Will it break Windows?", a: "It only changes documented Windows settings, and each tweak names the value it changes. If something doesn’t suit you, switch the tweak back or roll back to the restore point." },
    { q: "Can I undo changes?", a: "Yes. Tweaks switch back one at a time. Anything else, like removed apps, is covered by System Restore." },
    { q: "Which Windows versions?", a: "Windows 10 1809 or later, and Windows 11. Both x64 and ARM64 PCs; the installer picks the right one." },
    { q: "Why does it ask for administrator rights?", a: "Restore points, system-wide (HKLM) settings and S.M.A.R.T. drive data all need them." },
    { q: "Does it collect data?", a: "No telemetry. Signing in is optional and only used to send the email updates you choose." },
    { q: "Why is it free?", a: "It’s an open-source project under the MIT licence. There’s nothing to upgrade to." },
    { q: "My antivirus flagged it.", a: "Anchor is unsigned open-source software that changes system settings, which antivirus heuristics often dislike. You can read the source on GitHub and check the installer against the SHA-256 shown below." },
  ],

  seabed: {
    title: "Hold steady.",
    sub: "Free for Windows 10 and 11. One installer for every PC.",
    requires: "Windows 10 1809 or later · x64 or ARM64 · administrator rights",
  },
};
