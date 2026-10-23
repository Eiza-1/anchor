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
npm run build         # x64 + ARM64 -> release/nsis-web/ and portable .zip files
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
│   └── services/          ps, boost, cleanup, system, news, profile, auth, updater, …
└── src/                   React UI (no Node access, sandboxed renderer)
    ├── components/ui.tsx  shadcn/ui components (zinc theme)
    ├── pages/             one file per feature page (grouped into tabs in App.tsx)
    ├── lib/queries.ts     every page's data: cache keys, freshness, prefetch
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

Anchor ships as a **web installer**: a small setup stub (`AnchorSetup-<version>.exe`)
plus one app package per architecture (`anchor-<version>-x64.nsis.7z`,
`anchor-<version>-arm64.nsis.7z`). In-app updates download only the package for
that PC, and only the blocks that changed since the installed version, so an
update is usually a few MB rather than the whole app. (The first update from
0.3.0, which used the full installer, is still a full download.)

1. Bump `version` in `package.json`
2. Set a GitHub token with `repo` scope: `$env:GH_TOKEN = "<token>"`
3. `npm run release` — builds both architectures and uploads everything the
   updater needs (stub, both `.nsis.7z` packages and `latest.yml`) to a **draft**
   GitHub release tagged `v<version>`
4. Add release notes to the draft and publish it

Upload all of those files. Without `latest.yml` and the packages, in-app updates
can't find or verify the new version. Don't upload them by hand from separate
x64 and ARM64 builds; each build writes its own `latest.yml`, and the second
would overwrite the first.
