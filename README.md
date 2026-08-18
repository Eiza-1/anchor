# ⚓ Anchor

Open-source Windows optimization, built to be trusted. Anchor explains every change it makes, creates a System Restore point before touching anything, and keeps all its system code in one auditable place — no black boxes.

## Features

**Safety & transparency**
- System Restore point before any change — one click to roll back
- Every system command goes through `app/main/services/` — audit that folder and you've audited the app
- Local-first: your profile stays on your PC, news comes from public RSS feeds, nothing phones home

**Boost & Health Check**
- One-click Boost: trims RAM from background processes (never your open windows or taskbar apps) and clears temp files, with a transparency log of everything it skipped
- RAM freed is measured system-wide, the same way Task Manager measures it — not estimated
- Health Check runs every test in parallel: Windows build, pending updates, drive health, disk space, hardware faults (Device Manager problem codes), and live CPU/memory/disk pressure

**Game & App Boost**
- Reversible performance tweaks, each naming the exact registry value it changes: Game Mode, background Game DVR, fullscreen optimizations, windowed-game optimizations, variable refresh rate, GPU scheduling, background apps, animations
- Power plan switching, hidden Ultimate Performance plan, PCIe link power management
- GPU list with driver-age warnings, shader cache cleaning, per-game GPU preference

**System management**
- Startup app management, batch bloatware removal, privacy & telemetry toggles
- Drive health early warnings via S.M.A.R.T. — wear, temperature, failure prediction
- Performance monitoring with plain-language bottleneck advice
- Built-in Windows tool shortcuts and an Autounattend.xml generator

**Accounts & updates**
- Sign in with Google, GitHub, Microsoft, Discord, or a one-time email code (Supabase Auth, always in your default browser — Anchor never sees your password)
- In-app updates with a "What's new" changelog; no manual downloading

## Repository layout

```
app/            The application (Electron + React + shadcn/ui)
├── main/       Main process — ALL system access lives here
│   └── services/   ps, boost, system, perftweaks, news, profile, auth, updater
├── src/        React UI (sandboxed renderer, no Node access)
└── build/      Icon and logo used when packaging
docs/           Setup guides (Supabase auth) and email templates
landing/        Download page
```

## Building

Requires **Node.js 20+**. No Visual Studio, no .NET, no WebView2.

```powershell
cd app
npm install
npm run dev          # hot-reloading dev window
npm run build        # x64 installer + zip  → app/release
npm run build:arm64  # ARM64 installer + zip
```

Anchor requests administrator rights on launch — restore points, HKLM tweaks, and S.M.A.R.T. data all need them.

## Security model

- The renderer runs with `contextIsolation: true` and `nodeIntegration: false`; it can only call the functions listed in `app/main/preload.js`
- Every external link — news, videos, sign-in, updates — opens in your default browser; Anchor embeds no browser view
- The Supabase anon key in the source is public by design (the same key any Supabase-powered web page ships); no secrets are stored in the app

## License

MIT — see [LICENSE](LICENSE).
