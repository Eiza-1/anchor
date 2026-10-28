import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** A page left for longer than this is unmounted, so coming back rebuilds it and
 *  refetches its data as before; within it, switching back is instant. */
const KEEP_ALIVE_MS = 3 * 60_000;

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
        intro: "Live readings that show what's holding your PC back." },
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

function SectionView({ section, tabId, active }: { section: Section; tabId?: string; active: boolean }) {
  const tabs = section.tabs!;
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  // record the default tab in nav so isViewing({ section, tab }) is accurate
  // (only while showing: a kept-alive section mustn't steer navigation)
  useEffect(() => {
    if (active && tabId !== tab.id) navigate({ section: section.id, tab: tab.id });
  }, [active, tabId, tab.id, section.id]);
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

/** One section's page. The showing one enters (tab changes enter inside
 *  SectionView; no exit, so the new page never waits for the old one). A kept
 *  page is skipped by layout and paint (content-visibility) and can't be focused. */
function PageSlot({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      data-page-active={active || undefined}
      {...(!active && { inert: "" })}
      style={{ ...LAYER, contentVisibility: active ? "visible" : "hidden" }}
      initial={enter.initial}
      animate={active ? enter.animate : enter.initial}
      transition={active ? undefined : { duration: 0 }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </motion.div>
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
  const scroller = useRef<HTMLElement>(null);

  // Visited sections stay mounted (hidden) for KEEP_ALIVE_MS after you leave,
  // so going back doesn't rebuild and re-lay out the whole page. Each keeps its
  // own scroll position and last tab.
  const [kept, setKept] = useState<Map<string, number>>(() => new Map());
  const scrollOf = useRef(new Map<string, number>());
  const tabOf = useRef(new Map<string, string | undefined>());
  const shownId = useRef<string | null>(null);
  // the page's sideways offset while it slides into place after the sidebar opens or closes
  const shift = useMotionValue(0);

  /** The sidebar's open/closed width changes once, not every frame: the page
   *  re-lays out a single time and then slides (a transform) from where its
   *  centred column was to where it now is. */
  function resizeSidebar(commit: () => void) {
    const el = content.current;
    const page = el?.querySelector("[data-page-active]");
    const column = page?.querySelector(".page-column") ?? page?.firstElementChild;
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
  tabOf.current.set(current.id, nav.tab);

  // on a section change: remember where the old page was scrolled, keep it alive,
  // and drop pages left too long ago
  useLayoutEffect(() => {
    const prev = shownId.current;
    shownId.current = current.id;
    const main = scroller.current;
    if (prev === current.id || !main) return;
    if (prev) scrollOf.current.set(prev, main.scrollTop);
    main.scrollTop = scrollOf.current.get(current.id) ?? 0;
    const now = Date.now();
    setKept((old) => {
      const next = new Map([...old].filter(([id, left]) => now - left < KEEP_ALIVE_MS && id !== current.id));
      if (prev) next.set(prev, now);
      return next;
    });
  }, [current.id]);

  // a page that just went past its keep-alive time is dropped even if you stay put
  useEffect(() => {
    if (!kept.size) return;
    const t = setInterval(() => {
      const now = Date.now();
      setKept((old) => {
        const next = new Map([...old].filter(([, left]) => now - left < KEEP_ALIVE_MS));
        return next.size === old.size ? old : next;
      });
    }, 30_000);
    return () => clearInterval(t);
  }, [kept.size]);

  const mounted = [...NAV, ACCOUNT].filter((n) => n.id === current.id || kept.has(n.id));

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
          {/* right padding clears Windows' minimize/maximize/close buttons, which
              Electron draws over this strip: everything right of the title bar
              area (env(), reported by Electron) plus a gap; ~138px if unknown */}
          <div
            className="title-drag flex h-10 shrink-0 items-center justify-end pl-8"
            style={{ paddingRight: "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 138px)) + 12px)" }}
          >
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
                  Anchor {update.version} is available. You're on {version}.
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

          <main ref={scroller} className="flex-1 overflow-y-auto overflow-x-hidden px-8 pb-10">
            <motion.div ref={content} style={{ x: shift, willChange: "transform" }}>
              {mounted.map((section) => (
                <PageSlot key={section.id} active={section.id === current.id}>
                  {section.page ? (
                    <section.page />
                  ) : (
                    <SectionView
                      section={section}
                      tabId={section.id === current.id ? nav.tab : tabOf.current.get(section.id)}
                      active={section.id === current.id}
                    />
                  )}
                </PageSlot>
              ))}
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
