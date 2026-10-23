Build a fully interactive, single-page marketing website for **Anchor**, a free, open-source Windows optimization app (github.com/Eiza-1/anchor, MIT licence). It must feel unique and memorable, not like a SaaS template: no gradient-on-white hero, no row of three icon cards, no "Trusted by" logo strip, no fake testimonials.

## CORE CONCEPT: "Below the waterline"

The site is a vertical **descent**. Scrolling down sinks an anchor from a noisy surface to a still seabed. A bloated PC is a ship weighed down by junk; Anchor cuts the dead weight and holds the system steady.

The descent also carries Anchor's real promise: **no black boxes**. The deeper you go, the more of the hull you see. The surface is all noise and claims; the depths show exactly what Anchor changes, line by line. The environment darkens, quiets and calms as you scroll, the way a PC does after a cleanup.

- **Depth gauge:** fixed on the right edge, reading 0 m → 1,000 m from scroll position, with each section's name as a tick mark. On mobile it becomes a thin progress bar at the top.
- **Anchor chain:** a thin chain down the left edge that pays out as you scroll (SVG, drawn with scroll progress). The anchor on its end is Anchor's own mark.
- **Background:** bright, cluttered surface at the top, shifting to deep, still navy with faint bioluminescent specks of the brand orange at the bottom.

## VISUAL IDENTITY (use the real brand, from `brand/` in the repo)

- **Logo files:** `brand/svg/anchor-mark.svg` (orange mark), `anchor-mark-white.svg`, `anchor-icon.svg` (app icon tile), `anchor-lockup-white.svg` / `anchor-lockup-ink.svg` (mark + wordmark), `favicon.svg`. The brand sheet is `brand/brand-sheet.html`.
- **Mark:** an open ring that floats free of the shank, a straight shank and a wide bowl. The gap stands for the restore point you can always return to. Never close the gap, recolour the mark outside the palette, or capitalise the wordmark (it's always lowercase "anchor").
- **Colour** (dark is the default):
  - Buoy `#FF5A1F`: the one signal colour. Interaction, the mark, the primary button. Text on Buoy is Harbour, never white (white on Buoy fails contrast).
  - Flare `#FF7A33` and Ember `#EC420E`: hover and pressed states, the icon gradient.
  - Harbour `#0D1321`: deep ink, the seabed.
  - Foam `#F7F5F2`: light text and the surface.
  - Derive steel greys from Harbour (blue-tinted, never neutral grey).
- **Type:**
  - Schibsted Grotesk (Google Fonts, 400–700) for headlines and body. It's the wordmark's typeface. Set headlines tight (−0.02 to −0.03 em).
  - JetBrains Mono only for real readouts: depths, registry paths, console logs, version numbers and checksums. Never as decoration.
- **Texture:** faint grain, sonar rings, nautical-chart grid lines and depth soundings. A ship's instrument panel crossed with a modern dev tool.
- **Seasonal logo:** from 24 Oct to 1 Nov, swap the mark for `brand/svg/anchor-mark-halloween-white.svg` (the ring becomes a jack-o'-lantern), matching the app. Use the same date logic as `app/main/services/season.js`.

## SECTIONS (each is a depth layer)

### 1. SURFACE (0 m): hero
- **Headline:** "Your PC is carrying dead weight."
- **Sub:** "Anchor is a free, open-source Windows optimizer. It explains every change it makes and creates a restore point before touching anything."
- **Background:** a chaotic fake desktop of drifting, overlapping junk: generic notification pop-ups, startup-app tiles, toolbar spam and "YOUR PC IS SLOW!" scareware banners. All invented; never imitate a real company's product, logo or name.
- **"Drop anchor" button:** an anchor plunges down the screen, the junk sinks out of frame, the water goes still, and the page glides into section 2.
- **Secondary buttons:** "Download for Windows" (see DOWNLOAD LOGIC) and "View on GitHub" with the live star count.

### 2. THE DRAG (100 m): the problem
- **Bloat simulator:** an interactive mock of a Windows boot. Toggle invented bloat (startup apps, background services, telemetry, temp-file buildup, preinstalled apps) and watch a simulated boot timer, RAM bar and CPU graph react live.
- Label it clearly and permanently: **"Simulation — illustrative numbers, not a scan of your PC."**

### 3. THE CUT (300 m): what Anchor really does
Present Anchor's real features as **instrument modules**, not cards. Each panel has a switch; flipping it animates a before/after readout and shows, in mono, exactly what it changes on Windows. Use these real features:
- **Cleanup:** temp files, Windows Update and Delivery Optimization downloads, crash dumps, error reports, the system internet cache. One-click Boost on Home runs these defaults.
- **Game & App Boost:** reversible tweaks that each name the registry value they change: Game Mode, background Game DVR, fullscreen and windowed-game optimizations, variable refresh rate, GPU scheduling, background apps, animations. Also power plans (including the hidden Ultimate Performance plan), PCIe link power management, GPU driver-age warnings, shader cache cleaning and per-game GPU preference.
- **Startup:** startup app manager, plus **Boot Watch**, which flags suspicious processes and scripts that run at login.
- **Debloat:** batch bloatware removal, and privacy and telemetry toggles.
- **System:**
  - **Drive health:** S.M.A.R.T. early warnings for wear, temperature and failure prediction, plus a disk speed test.
  - **Diagnostics:** Health Check runs every test in parallel: Windows build, pending updates, drive health, disk space, Device Manager faults, and live CPU/memory/disk pressure.
  - **Tools:** built-in Windows tools and an Autounattend.xml generator.
- **Performance monitor:** plain-language bottleneck advice.
- **Windows Update:** check and manage updates.

**Safety module** (keep it accurate):
- "Restore point first: Anchor creates a System Restore point before a system change (weekly by default; set it to every change in Account)."
- Tweaks are individually reversible.
- App removals are covered by the restore point.
- Every system command lives in one folder, `app/main/services/`; audit that folder and you've audited the app.

### 4. LIVE DEMO (500 m): try it in the browser
A faithful, clickable mock of the real Anchor window (base it on screenshots of the app):
- **Window:** dark frosted-glass panels with cut corners, a cyan primary accent (the app's default theme), and a draggable window with minimize and close buttons.
- **Sidebar:** Home, Tech Spotlight, Windows Update, Cleanup. Under OPTIMIZE: Performance, Startup, Debloat, System. Account at the bottom.
- **Home:** greeting, "Boost now" and "Health Check" buttons, a Game Releases rail and a Free games row (use invented game titles and art).
- **Interaction:** click through the pages and toggle tweaks. "Apply" runs a fake log in a mono console: "Creating restore point… done", "Disabling 14 startup items… done".
- Label it: **"Demo — nothing here touches your PC."**
- **Mobile:** a swipeable, full-width version instead of the draggable window.

### 5. OPEN WATERS (700 m): open source
- **Live stats:** read `api.github.com/repos/Eiza-1/anchor` for stars, forks, contributors, latest release version and last commit date. Cache the responses in sessionStorage. If the API fails or rate-limits, hide the numbers quietly instead of showing errors or zeros.
- **Contributors:** avatars as small pulsing sonar blips; hover or focus to see the username.
- **Terminal block:** working copy button.
  ```
  git clone https://github.com/Eiza-1/anchor.git
  cd anchor/app
  npm install
  npm run dev
  ```
  Note that building needs Node.js 20+, and nothing else: no Visual Studio, .NET or WebView2.
- **Manifesto** (short and dry): free, MIT-licensed, no ads, no upsells. Local-first: your profile stays on your PC and nothing phones home. Sign-in is optional, only used for email updates, and always happens in your own browser; Anchor never sees your password.

### 6. SONAR (850 m): FAQ
An accordion styled as sonar pings. Answer honestly:
- **Is it safe?** Restore point first; every system command is in one auditable folder.
- **Can I undo changes?** Tweaks individually; anything else through System Restore.
- **Which Windows versions?** Windows 10 1809 or later, x64 or ARM64.
- **Why does it ask for administrator rights?** Restore points, HKLM tweaks and S.M.A.R.T. data need them.
- **Does it collect data?** No telemetry. Optional sign-in only for email updates.
- **Why is it free?** It's an open-source project, MIT-licensed.
- **My antivirus flagged it.** It's unsigned open-source software that changes system settings, which heuristics dislike. Here's the source and the file's SHA-256 to check.

### 7. SEABED (1,000 m): final CTA
- Calm and dark, almost silent. The anchor settles into the sand with a soft dust puff.
- **Headline:** "Hold steady."
- **Download button:** shows the version number, file size and SHA-256 (all from the API; see DOWNLOAD LOGIC).
- **Links:** all releases and the changelog (the GitHub releases page). No Discord or community links; there aren't any yet.
- Minimal footer: MIT licence, GitHub, "Made for Windows".

## DOWNLOAD LOGIC (must always point at the latest installer)

Every "Download" button must download the **latest recommended installer** from GitHub Releases, never a hard-coded version.

1. **On load,** fetch `https://api.github.com/repos/Eiza-1/anchor/releases/latest`. It returns the newest published, non-draft, non-prerelease release.
2. **Find the asset** whose name matches `/^AnchorSetup-[\d.]+\.exe$/`. That's the web installer; it picks x64 or ARM64 automatically. Ignore the `.7z` packages, `latest.yml` and the zips.
3. **Fill the button from that asset:**
   - `href` = the asset's `browser_download_url`
   - label = "Download Anchor {tag_name without the v}"
   - size from `size`
   - SHA-256 from the asset's `digest` field (format `sha256:…`). Hide the checksum row if it's missing.
4. **Fallback:** if the API fails or no asset matches, point the button at `https://github.com/Eiza-1/anchor/releases/latest` (the release page itself), labelled "Download from GitHub". Never leave a dead or hard-coded link.
5. **Secondary link** under the main button: "Portable .zip (no install)", pointing to the asset matching `/^Anchor-[\d.]+-win\.zip$/`. Offer the ARM64 zip (`-arm64-win.zip`) when the visitor is detected as ARM. Use `navigator.userAgentData.getHighEntropyValues(['architecture'])` where supported; otherwise just offer both.
6. **Non-Windows visitors** (macOS, Linux, iOS, Android): the button reads "Anchor is for Windows — view the source on GitHub" and links to the repo.

## SIGNATURE INTERACTIONS

- **Must-haves:** the scroll-linked anchor chain and the depth gauge.
- **Custom cursor:** a small sonar ring that pings on click and grows over interactive elements. Desktop pointer devices only; normal cursor on touch and for reduced motion.
- **Easter eggs:** typing "drop" anywhere replays the hero anchor drop. The Konami code turns the site into a Windows 95 theme.
- **Ambient sound:** optional, off by default. A muted underwater hum that fades with depth.
- **Restraint:** one orchestrated moment per section. Avoid scattered hover effects, and use magnetic buttons sparingly (primary CTAs only).

## TECHNICAL REQUIREMENTS

- **Stack:** plain HTML, CSS and JS. Use GSAP + ScrollTrigger and Lenis, pinned to exact versions from cdnjs or jsDelivr. No framework or build step required, so it can live in the repo's `landing/` folder and be served from GitHub Pages.
- **Content in one file:** all copy, features, FAQ, links and the repo owner/name go in a single `content.js` (or `content.json`), so text and links can be edited without touching layout code.
- **Responsive:**
  - phones get the top progress bar instead of the gauge, and a swipeable demo;
  - the anchor drop stays.
- **Performance:**
  - Lighthouse 90+;
  - lazy-initialise the heavy sections (simulator, demo);
  - animate only transform and opacity;
  - no layout shift (reserve space for live numbers).
- **Accessibility:**
  - semantic landmarks;
  - every toggle and the demo usable by keyboard;
  - visible focus states in Buoy;
  - WCAG AA contrast;
  - `prefers-reduced-motion` turns off the parallax, the drop animation, the cursor and the chain animation; content stays complete and readable without motion.
- **SEO:**
  - title, description and canonical URL;
  - an Open Graph / Twitter card image built from `anchor-icon.svg` and the lockup on Harbour;
  - SoftwareApplication JSON-LD (operatingSystem "Windows 10, Windows 11", applicationCategory "UtilitiesApplication", price 0, license MIT, downloadUrl = the releases/latest page).
- **Favicon:** `brand/svg/favicon.svg`.

## TONE OF COPY

Calm, confident, slightly dry. Honest and technical, never scammy. Anchor is the antidote to "PC cleaner" scareware, so the site must never use:
- fake urgency, countdowns or "X threats found";
- simulated scan results presented as real;
- speed-up percentages or "makes your PC 2× faster" claims;
- any claim the app doesn't back up (check the README).

Say what Anchor changes, plainly, in Windows' own terms. Deliver clean, commented code.
