import { useEffect, useState } from "react";
import {
  Home, Zap, RefreshCw, Newspaper, Rocket, Trash2, Lock, HardDrive,
  Activity, Wrench, User, Anchor as AnchorIcon, Download, X, Gamepad2, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { WhatsNew } from "@/components/WhatsNew";
import { initUpdates, useUpdateState } from "@/lib/store";

import HomePage from "@/pages/HomePage";
import BoostPage from "@/pages/BoostPage";
import GameBoostPage from "@/pages/GameBoostPage";
import UpdatesPage from "@/pages/UpdatesPage";
import SpotlightPage from "@/pages/SpotlightPage";
import StartupPage from "@/pages/StartupPage";
import BloatwarePage from "@/pages/BloatwarePage";
import PrivacyPage from "@/pages/PrivacyPage";
import DrivesPage from "@/pages/DrivesPage";
import PerformancePage from "@/pages/PerformancePage";
import ToolsPage from "@/pages/ToolsPage";
import AccountPage from "@/pages/AccountPage";

const NAV = [
  { id: "home", label: "Home", icon: Home, page: HomePage },
  { id: "boost", label: "Boost & Health Check", icon: Zap, page: BoostPage },
  { id: "gameboost", label: "Game & App Boost", icon: Gamepad2, page: GameBoostPage },
  { id: "updates", label: "Windows Update", icon: RefreshCw, page: UpdatesPage },
  { id: "spotlight", label: "Tech Spotlight", icon: Newspaper, page: SpotlightPage },
  { separator: true, id: "s1" },
  { id: "startup", label: "Startup Apps", icon: Rocket, page: StartupPage },
  { id: "bloatware", label: "Bloatware Removal", icon: Trash2, page: BloatwarePage },
  { id: "privacy", label: "Privacy & Telemetry", icon: Lock, page: PrivacyPage },
  { separator: true, id: "s2" },
  { id: "drives", label: "Drive Health", icon: HardDrive, page: DrivesPage },
  { id: "performance", label: "Performance", icon: Activity, page: PerformancePage },
  { id: "tools", label: "Advanced Tools", icon: Wrench, page: ToolsPage },
] as const;

export default function App() {
  const [active, setActive] = useState("home");
  const [version, setVersion] = useState("");
  const [whatsNew, setWhatsNew] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const update = useUpdateState();

  useEffect(() => {
    window.anchor.appVersion().then(setVersion);
    initUpdates();
  }, []);

  const updateReady = update.status === "available" || update.status === "downloaded";

  const current = [...NAV, { id: "account", label: "Account", icon: User, page: AccountPage }].find(
    (n) => "page" in n && n.id === active
  ) as { page: React.ComponentType } | undefined;
  const Page = current?.page ?? HomePage;

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card/40">
        <div className="flex h-10 items-center gap-2 px-4" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
          <AnchorIcon className="size-4 text-sky-500" />
          <span className="text-sm font-semibold">Anchor</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) =>
            "separator" in item ? (
              <div key={item.id} className="my-2 h-px bg-border" />
            ) : (
              <NavButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={active === item.id}
                onClick={() => setActive(item.id)}
              />
            )
          )}
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
          <Page />
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
