import { useEffect, useState } from "react";
import { Download, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge, Button, Progress, Skeleton } from "@/components/ui";
import { useUpdateState } from "@/lib/store";
import { motion } from "framer-motion";
import { SPRING } from "@/lib/motion";

type Release = {
  version: string; name: string; date: string; notes: string; url: string; isCurrent: boolean;
};

/** Renders GitHub markdown release notes well enough for a changelog:
 *  headings, bullets and bold. Deliberately not a full markdown engine. */
function Notes({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  return (
    <div className="space-y-1.5">
      {lines.map((raw, i) => {
        const line = raw.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
        if (/^#{1,6}\s/.test(line))
          return (
            <p key={i} className="pt-2 text-sm font-semibold">
              {line.replace(/^#{1,6}\s/, "")}
            </p>
          );
        if (/^[-*]\s/.test(line))
          return (
            <p key={i} className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-muted-foreground/50">•</span>
              <span>{line.replace(/^[-*]\s/, "")}</span>
            </p>
          );
        if (/^\|/.test(line)) return null; // skip markdown tables
        return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
      })}
    </div>
  );
}

export function WhatsNew({ open, onClose, version }: { open: boolean; onClose: () => void; version: string }) {
  const update = useUpdateState();
  const [releases, setReleases] = useState<Release[] | null>(null);

  useEffect(() => {
    if (open && releases === null) window.anchor.updateNotes(6).then(setReleases);
  }, [open, releases]);

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="glass-strong cut-corner flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING}
      >
        <div className="flex items-center gap-3 border-b border-foreground/10 p-4">
          <Sparkles className="size-4 text-primary" />
          <div className="flex-1">
            <h2 className="text-base font-bold tracking-tight">What's new in Anchor</h2>
            <p className="text-xs text-muted-foreground">You're running v{version}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}><X /></Button>
        </div>

        {/* update controls */}
        <div className="border-b border-foreground/10 p-4">
          {update.status === "available" || update.status === "downloading" || update.status === "downloaded" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Version {update.version} available</Badge>
                {update.status === "downloaded" && <Badge variant="success">Ready to install</Badge>}
              </div>
              {update.status === "downloading" && (
                <div className="space-y-1.5">
                  <Progress value={update.percent ?? 0} />
                  <p className="text-xs text-muted-foreground">Downloading… {update.percent ?? 0}%</p>
                </div>
              )}
              {update.status === "available" && (
                <Button onClick={() => window.anchor.updateDownload()}>
                  <Download /> Download update
                </Button>
              )}
              {update.status === "downloaded" && (
                <Button onClick={() => window.anchor.updateInstall()}>
                  Restart & install
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                loading={update.status === "checking"}
                onClick={() => window.anchor.updateCheck()}
              >
                {update.status !== "checking" && <RefreshCw />} Check for updates
              </Button>
              <span className="text-xs text-muted-foreground">
                {update.status === "current" && "You're on the latest version."}
                {update.status === "error" && `Couldn't check: ${update.message}`}
              </span>
            </div>
          )}
        </div>

        {/* changelog */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {releases === null ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No release notes available. Check your connection or view them on GitHub.
            </p>
          ) : (
            releases.map((r) => (
              <div key={r.version} className="glass cut-corner space-y-2 rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{r.name || `v${r.version}`}</h3>
                  {r.isCurrent && <Badge variant="secondary">Installed</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {r.date ? new Date(r.date).toLocaleDateString() : ""}
                  </span>
                </div>
                <Notes text={r.notes} />
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
