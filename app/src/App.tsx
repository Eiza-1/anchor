import { useEffect, useState } from "react";
import {
  Home, Eraser, Gauge, Newspaper, Rocket, Trash2, HardDrive, User, Anchor as AnchorIcon, Download, X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Tabs } from "@/components/ui";
import { WhatsNew } from "@/components/WhatsNew";
import { applyTheme, initUpdates, useUpdateState } from "@/lib/store";
import { prefetch } from "@/lib/queries";

import HomePage from "@/pages/HomePage";
import BoostPage from "@/pages/BoostPage";
import GameBoostPage from "@/pages/GameBoostPage";
import BootWatchPage from "@/pages/BootWatchPage";
import DiagnosticsPage from "@/pages/DiagnosticsPage";
import UpdatesPage from "@/pages/UpdatesPage";
import SpotlightPage from "@/pages/SpotlightPage";
import StartupPage from "@/pages/StartupPage";
import BloatwarePage from "@/pages/BloatwarePage";
import PrivacyPage from "@/pages/PrivacyPage";
import DrivesPage from "@/pages/DrivesPage";
import PerformancePage from "@/pages/PerformancePage";
import ToolsPage from "@/pages/ToolsPage";
import AccountPage from "@/pages/AccountPage";

type Tab = { id: string; label: string; intro: string; page: React.ComponentType };
type Section = {
  id: string; label: string; icon: React.ComponentType<{ className?: string }>;
  page?: React.ComponentType; tabs?: Tab[];
};

// Related tools share one sidebar entry, as tabs, so the sidebar stays short.
const NAV: Section[] = [
  { id: "home", label: "Home", icon: Home, page: HomePage },
  { id: "cleanup", label: "Cleanup", icon: Eraser, page: BoostPage },
  {
    id: "performance", label: "Performance", icon: Gauge, tabs: [
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
      { id: "updates", label: "Windows Update", page: UpdatesPage,
        intro: "Check for pending updates and read recent update news." },
      { id: "tools", label: "Tools", page: ToolsPage,
        intro: "Microsoft's own maintenance tools, one click away." },
    ],
  },
  { id: "spotlight", label: "Tech Spotlight", icon: Newspaper, page: SpotlightPage },
];
const ACCOUNT: Section = { id: "account", label: "Account", icon: User, page: AccountPage };

// Remembers the open tab in each section while the app runs.
const lastTab: Record<string, string> = {};

function SectionView({ section }: { section: Section }) {
  const tabs = section.tabs!;
  const [tabId, setTabId] = useState(lastTab[section.id] ?? tabs[0].id);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const Page = tab.page;
  return (
    <div>
      <div className="mx-auto max-w-4xl space-y-3 pt-6">
        <h1 className="text-3xl font-semibold tracking-tight">{section.label}</h1>
        <Tabs
          value={tab.id}
          onValueChange={(v) => { lastTab[section.id] = v; setTabId(v); }}
          options={tabs.map((t) => ({ value: t.id, label: t.label }))}
        />
        <p className="text-sm text-muted-foreground">{tab.intro}</p>
      </div>
      <Page key={tab.id} />
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("home");
  const [version, setVersion] = useState("");
  const [whatsNew, setWhatsNew] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const update = useUpdateState();

  useEffect(() => {
    window.anchor.appVersion().then(setVersion);
    window.anchor.loadProfile().then((p) => applyTheme(p.theme ?? "dark"));
    initUpdates();
    // after first paint, so the window appears before any background work
    const t = setTimeout(prefetch, 600);
    return () => clearTimeout(t);
  }, []);

  const updateReady = update.status === "available" || update.status === "downloaded";

  const current = [...NAV, ACCOUNT].find((n) => n.id === active) ?? NAV[0];
  const Page = current.page;

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card/40">
        <div className="flex h-10 items-center gap-2 px-4" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <AnchorIcon className="size-4 text-sky-500" />
          <span className="text-sm font-semibold">Anchor</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={active === item.id}
              onClick={() => setActive(item.id)}
            />
          ))}
        </nav>

        <div className="space-y-1 border-t p-3">
          <NavButton icon={User} label="Account" active={active === "account"} onClick={() => setActive("account")} />
          <p className="px-3 pt-2 text-[11px] text-muted-foreground">v{version}</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* title bar strip: draggable, with the What's new tab pinned right */}
        <div
          className="flex h-10 shrink-0 items-center justify-end px-8"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <button
            onClick={() => setWhatsNew(true)}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className={cn(
              "relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
              updateReady
                ? "bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Sparkles className="size-3.5" />
            {updateReady ? `Update to ${update.version}` : "What's new"}
            {updateReady && <span className="ml-0.5 size-1.5 rounded-full bg-sky-400" />}
          </button>
        </div>

        {updateReady && !dismissed && (
          <div className="mx-8 mb-2 flex items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm">
            <Download className="size-4 shrink-0 text-sky-400" />
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

        <main className="flex-1 overflow-y-auto px-8 pb-10">
          {Page ? <Page /> : <SectionView key={current.id} section={current} />}
        </main>
      </div>

      <WhatsNew open={whatsNew} onClose={() => setWhatsNew(false)} version={version} />
    </div>
  );
}

function NavButton({
  icon: Icon, label, active, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
