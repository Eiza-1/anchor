# ⚓ Anchor

Open-source Windows optimization, built to be trusted. Anchor matches the look of the Windows 11 Settings app (WinUI 3), explains every change it makes, and creates a System Restore point before touching anything — no black boxes.

## Features

**Safety & transparency**
- System Restore point before any change (Boost, bloatware removal, privacy tweaks) — one click to roll back
- 100% open source; every system action goes through `Services/PowerShellRunner.cs` or documented Windows APIs, so the code behind every button is auditable
- Local-first: your profile stays in `%LOCALAPPDATA%\Anchor\profile.json`; news comes from public RSS feeds; nothing phones home

**Boost & Health Check**
- One-click Boost: trims RAM working sets of background processes — never your open windows, taskbar apps, or critical system processes — and clears temp files
- Transparency log shows exactly which processes were skipped and why
- Read-only Health Check: Windows Update status, drive health, disk space, CPU/memory/disk pressure

**Windows Update**
- Checks whether you're on a recent stable build (cumulative / security / feature updates) via the built-in Windows Update Agent API
- "Recent" news tab with article previews from WindowsLatest, the Windows Blog, and Windows Central

**Tech Spotlight**
- Latest tech news panel from CNET, WindowsLatest, Windows Central, TechCrunch, and The Verge, filterable by source, newest first

**System management**
- Startup app management (same mechanism as Task Manager, fully reversible)
- Bloatware removal in batches, with a curated safe-list and blocked essentials
- Privacy & telemetry toggles — each one shows the exact registry value it changes
- Drive health early warnings (S.M.A.R.T. + storage reliability counters): wear, temperature, failure prediction
- Performance monitoring with plain-language bottleneck suggestions
- Direct access to built-in tools: Disk Cleanup, Storage Sense, Task Scheduler, System Restore, Resource Monitor, Optimize Drives
- Autounattend.xml generator for replicating a tuned setup across multiple PCs

**Personalization**
- Greeting by name and time of day
- Local profile (name/email) with mail-preference toggles: Windows update stability, system health feedback, tech news, Anchor updates
- OAuth sign-in buttons (Google, Apple, GitHub, Facebook) wired but shipped without keys — see `docs/OAUTH_SETUP.md`

## Building

1. Install **Visual Studio 2022** (free Community edition) with the **.NET Desktop Development** workload and **Windows App SDK** components (check ".NET 8" and "Windows 11 SDK").
2. Open `Anchor.sln`, set configuration to `Debug | x64`, press **F5**.
3. Anchor asks for administrator rights on launch (required for restore points, HKLM tweaks, and S.M.A.R.T. data).

## Project layout

```
Anchor/
├── App.xaml(.cs)          App entry + shared Windows-11-style styles
├── MainWindow.xaml(.cs)   NavigationView shell
├── Pages/                 One page per feature area
└── Services/              All system logic — audit starts here
```

## Philosophy

- Simple by default: one Boost button; power tools tucked into Advanced Tools.
- Every toggle has a plain-language explanation of what it enables or disables.
- Prefer Windows' own mechanisms (Restore points, Remove-AppxPackage, StartupApproved, WUA API, S.M.A.R.T.) over hacks.
- Like Microsoft's PowerToys, experimental features should be tested openly with the community before landing in the core app.

## License

MIT — see [LICENSE](LICENSE).
