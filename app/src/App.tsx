import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Home, Eraser, Gauge, Newspaper, Rocket, Trash2, HardDrive, User, Download, X, Sparkles, RefreshCw,
} from "lucide-react";
import { Button, PageTitle, Tabs } from "@/components/ui";
import { WhatsNew } from "@/components/WhatsNew";
import { applyTheme, initUpdates, useUpdateState } from "@/lib/store";
import { prefetch } from "@/lib/queries";
import { navigate, useNav } from "@/lib/nav";
import { Toaster } from "@/components/Toaster";
import { FpsMeter } from "@/components/FpsMeter";
import { AppBackground } from "@/components/AppBackground";
import { Sidebar } from "@/components/Sidebar";
import { MotionConfig, animate, motion, useMotionValue } from "framer-motion";
import { SPRING, enter, useReduceMotion } from "@/lib/motion";

import HomePage from "@/pages/HomePage";

// Home is in the startup bundle; every other page is its own chunk, fetched
// right after the first paint (loadPages) so the window shows sooner and a
// page is already there by the time anyone clicks to it.
const PAGES = {
  boost: () => import("@/pages/BoostPage"),
  gameBoost: () => import("@/pages/GameBoostPage"),
  bootWatch: () => import("@/pages/BootWatchPage"),
  diagnostics: () => import("@/pages/DiagnosticsPage"),
  updates: () => import("@/pages/UpdatesPage"),
  spotlight: () => import("@/pages/SpotlightPage"),
  startup: () => import("@/pages/StartupPage"),
  bloatware: () => import("@/pages/BloatwarePage"),
  privacy: () => import("@/pages/PrivacyPage"),
  drives: () => import("@/pages/DrivesPage"),
  performance: () => import("@/pages/PerformancePage"),
  tools: () => import("@/pages/ToolsPage"),
  account: () => import("@/pages/AccountPage"),
};
/** framer-motion moves these from JavaScript, frame by frame; without a layer of
 *  their own Chromium re-rasterises the whole page on every one of those frames. */
const LAYER = { willChange: "transform, opacity" } as const;

const loadPages = () => Object.values(PAGES).forEach((load) => load().catch(() => {}));

const BoostPage = lazy(PAGES.boost);
const GameBoostPage = lazy(PAGES.gameBoost);
const BootWatchPage = lazy(PAGES.bootWatch);
const DiagnosticsPage = lazy(PAGES.diagnostics);
const UpdatesPage = lazy(PAGES.updates);
const SpotlightPage = lazy(PAGES.spotlight);
const StartupPage = lazy(PAGES.startup);
const BloatwarePage = lazy(PAGES.bloatware);
const PrivacyPage = lazy(PAGES.privacy);
const DrivesPage = lazy(PAGES.drives);
const PerformancePage = lazy(PAGES.performance);
const ToolsPage = lazy(PAGES.tools);
const AccountPage = lazy(PAGES.account);

type Tab = { id: string; label: string; intro: string; page: React.ComponentType };
type Section = {
  id: string; label: string; icon: React.ComponentType<{ className?: string }>;
  page?: React.ComponentType; tabs?: Tab[];
  /** Starts a labelled sidebar group. */
  group?: string;
};

// Related tools share one sidebar entry, as tabs, so the sidebar stays short.
const NAV: Section[] = [
  { id: "home", label: "Home", icon: Home, page: HomePage },
  { id: "spotlight", label: "Tech Spotlight", icon: Newspaper, page: SpotlightPage },
  { id: "updates", label: "Windows Update", icon: RefreshCw, page: UpdatesPage },
  { id: "cleanup", label: "Cleanup", icon: Eraser, page: BoostPage },
  {
    id: "performance", label: "Performance", icon: Gauge, group: "Optimize", tabs: [
      { id: "boost", label: "Game & App Boost", page: GameBoostPage,
        intro: "Reversible Windows settings that free up resources for games and heavy apps." },
      { id: "monitor", label: "Live monitor", page: PerformancePage,
        intro: "Live readings every second, showing which part of your PC is holding it back." },
    ],
  },
  {
    id: "startup", label: "Startup", icon: Rocket, tabs: [
      { id: "apps", label: "Startup apps", page: StartupPage,
        intro: "Stop apps launching at boot. Nothing is uninstalled; switch them back on any time." },
      { id: "bootwatch", label: "Boot Watch", page: BootWatchPage,
        intro: "Everything set to run at startup, with anything suspicious flagged." },
    ],
  },
  {
    id: "debloat", label: "Debloat", icon: Trash2, tabs: [
      { id: "bloatware", label: "Bloatware", page: BloatwarePage,
        intro: "Remove pre-installed Store apps. Ones marked Safe can be reinstalled from the Store." },
      { id: "privacy", label: "Privacy", page: PrivacyPage,
        intro: "Turn off telemetry. Each toggle names the registry value it changes." },
    ],
  },
  {
    id: "system", label: "System", icon: HardDrive, tabs: [
      { id: "drives", label: "Drive health", page: DrivesPage,
        intro: "Early warning for failing drives, from Windows' own S.M.A.R.T. data." },
      { id: "diagnostics", label: "Diagnostics", page: DiagnosticsPage,
        intro: "Memory leaks, background CPU hogs, piling-up errors and pending restarts." },
      { id: "tools", label: "Tools", page: ToolsPage,
        intro: "Microsoft's own maintenance tools, one click away." },
    ],
  },
];
const ACCOUNT: Section = { id: "account", label: "Account", icon: User, page: AccountPage };

function SectionView({ section, tabId }: { section: Section; tabId?: string }) {
  const tabs = section.tabs!;
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  // record the default tab in nav so isViewing({ section, tab }) is accurate
  useEffect(() => {
    if (tabId !== tab.id) navigate({ section: section.id, tab: tab.id });
  }, [tabId, tab.id, section.id]);
  const Page = tab.page;
  return (
    <div>
      <div className="page-column space-y-3 pt-6">
        <PageTitle>{section.label}</PageTitle>
        <Tabs
          value={tab.id}
          onValueChange={(v) => navigate({ section: section.id, tab: v })}
          options={tabs.map((t) => ({ value: t.id, label: t.label }))}
        />
        <p className="text-sm text-foreground/80 dark:[text-shadow:0_1px_8px_rgb(0_0_0/0.5)]">{tab.intro}</p>
      </div>
      {/* the heading stays put (its tab pill glides); the tab's content enters */}
      <motion.div key={tab.id} {...enter} style={LAYER}>
        <Suspense fallback={null}>
          <Page />
        </Suspense>
      </motion.div>
    </div>
  );
}

export default function App() {
  const nav = useNav();
  const [version, setVersion] = useState("");
  const [whatsNew, setWhatsNew] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const update = useUpdateState();
  // Anchor animates regardless of Windows' "Animation effects"; Account → Appearance can turn it down
  const reduceMotion = useReduceMotion();
  const content = useRef<HTMLDivElement>(null);
  // the page's sideways offset while it slides into place after the sidebar opens or closes
  const shift = useMotionValue(0);

  /** The sidebar's open/closed width changes once, not every frame: the page
   *  re-lays out a single time and then slides (a transform) from where its
   *  centred column was to where it now is. */
  function resizeSidebar(commit: () => void) {
    const el = content.current;
    const column = el?.querySelector(".page-column") ?? el?.firstElementChild?.firstElementChild;
    const before = column?.getBoundingClientRect().left;
    flushSync(commit);
    if (reduceMotion || before === undefined || !column) return;
    shift.set(shift.get() + before - column.getBoundingClientRect().left);
    animate(shift, 0, SPRING);
  }

  useEffect(() => {
    window.anchor.appVersion().then(setVersion);
    window.anchor.loadProfile().then((p) => applyTheme(p.theme ?? "dark"));
    initUpdates();
    const offNav = window.anchor.onNavigate(navigate);
    // after first paint, so the window appears before any background work
    const t = setTimeout(() => { prefetch(); loadPages(); }, 600);
    return () => { clearTimeout(t); offNav(); };
  }, []);

  const updateReady = update.status === "available" || update.status === "downloaded";

  const current = [...NAV, ACCOUNT].find((n) => n.id === nav.section) ?? NAV[0];
  const Page = current.page;

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"} transition={SPRING}>
      {/* transparent shell over the picture; body keeps the solid theme colour as a fallback */}
      <div className="flex h-full">
        <AppBackground mode={nav.section === "home" ? "home" : "page"} />
        <Sidebar items={NAV} account={ACCOUNT} active={current.id} version={version} onResize={resizeSidebar} />

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* title bar strip: draggable (except under a peeked sidebar), with the
              update tab pinned right while an update is ready */}
          <div className="title-drag flex h-10 shrink-0 items-center justify-end px-8">
            {updateReady && (
              <button
                onClick={() => setWhatsNew(true)}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                className="relative flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/25"
              >
                <Sparkles className="size-3.5" />
                Update to {update.version}
                <span className="ml-0.5 size-1.5 rounded-full bg-primary" />
              </button>
            )}
          </div>

          {updateReady && !dismissed && (
            <div className="glass cut-corner mx-8 mb-2 flex items-center gap-3 rounded-lg px-4 py-3 text-sm">
              <Download className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  Anchor {update.version} is available — you're on {version}
                </p>
                <p className="text-xs text-muted-foreground">
                  {update.status === "downloaded"
                    ? "Downloaded and ready. Restart to install."
                    : "Anchor can download and install it for you."}
                </p>
              </div>
              {update.status === "downloaded" ? (
                <Button size="sm" onClick={() => window.anchor.updateInstall()}>Restart & install</Button>
              ) : (
                <Button size="sm" onClick={() => window.anchor.updateDownload()}>Update now</Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => setDismissed(true)}><X /></Button>
            </div>
          )}

          <main className="flex-1 overflow-y-auto overflow-x-hidden px-8 pb-10">
            <motion.div ref={content} style={{ x: shift, willChange: "transform" }}>
              {/* enters on every section change; tab changes enter inside SectionView.
                  No exit, so the new page never waits for the old one. */}
              <motion.div key={current.id} {...enter} style={LAYER}>
                <Suspense fallback={null}>
                  {Page ? <Page /> : <SectionView section={current} tabId={nav.tab} />}
                </Suspense>
              </motion.div>
            </motion.div>
          </main>
        </div>

        <Toaster />
        <FpsMeter />
        <WhatsNew open={whatsNew} onClose={() => setWhatsNew(false)} version={version} />
      </div>
    </MotionConfig>
  );
}
