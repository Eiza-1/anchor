# Anchor (Electron + React + shadcn/ui)

The current Anchor UI. Replaces the original WinUI 3 app (kept in `../Anchor/` for reference).

## Prerequisites

- **Node.js 20+** — `winget install OpenJS.NodeJS.LTS`
- No Visual Studio, no .NET, no WebView2 required.

## First run

```powershell
cd C:\Claude_projects\CLAUDE\Anchor\app
npm install
npm run dev          # hot-reloading dev window
```

## Building installers

```powershell
npm run build         # x64  -> release/AnchorSetup-<version>-x64.exe  + .zip
npm run build:arm64   # ARM64
```

Both are self-contained: Electron bundles its own Chromium, so nothing extra is
installed on the user's PC. The app requests administrator rights on launch
(needed for restore points, HKLM tweaks, and S.M.A.R.T. data).

Before building, copy your icon to `build/icon.ico` (the same file the old
`make-icons.ps1` produced at `../Anchor/Anchor/Assets/anchor.ico`).

## Layout

```
app/
├── main/                  Electron main process — ALL system access lives here
│   ├── main.js            window + IPC handlers
│   ├── preload.js         the only bridge exposed to the UI
│   └── services/          ps, boost, system, news, profile, auth, appUpdate
└── src/                   React UI (no Node access, sandboxed renderer)
    ├── components/ui.tsx  shadcn/ui components (zinc theme)
    ├── pages/             one file per feature page
    └── index.css          shadcn design tokens
```

## Security model

- The renderer runs with `contextIsolation: true`, `nodeIntegration: false`; it can
  only call the functions listed in `main/preload.js`.
- Every system command goes through `main/services/ps.js` — audit that file and the
  services next to it to see everything Anchor can do.
- All external links (news, videos, sign-in, updates) open in the user's **default
  browser** via `shell.openExternal` — Anchor never embeds a browser view.

## Releasing

1. Bump `version` in `package.json`
2. `npm run build` and `npm run build:arm64`
3. Commit + push
4. GitHub release tagged `v<version>` (e.g. `v0.3.0`) with the installers attached

The in-app update banner reads that release via the public GitHub API.
