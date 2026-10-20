import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { onTaskFinished, type Task } from "@/lib/tasks";
import { isViewing, navigate, type NavTarget } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

interface Toast { id: number; title: string; body: string; ok: boolean; target: NavTarget }

const MAX = 3;
const HIDE_MS = 6000;
let nextId = 1;

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);

  useEffect(() => onTaskFinished((t: Task) => {
    if (t.silent || isViewing(t.where)) return;
    const ok = t.status !== "error";
    const title = `${t.label} ${ok ? "finished" : "failed"}`;
    const body = t.summary ?? t.error ?? "";
    setToasts((l) => [...l, { id: nextId++, title, body, ok, target: t.where }].slice(-MAX));
    window.anchor.notify({ title, body, target: t.where }).catch(() => {});
  }), []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [hover, setHover] = useState(false);
  const left = useRef(HIDE_MS);

  // Counts down while not hovered; the remaining time is kept across hovers.
  useEffect(() => {
    if (hover) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(0, left.current - (Date.now() - started));
    };
  }, [hover, toast.id, onDismiss]);

  const Icon = toast.ok ? CheckCircle2 : XCircle;
  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, x: 48, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.96 }}
      transition={SPRING}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { navigate(toast.target); onDismiss(toast.id); }}
      className="glass-strong cut-corner pointer-events-auto flex w-full items-start gap-3 rounded-lg p-3 text-left"
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", toast.ok ? "text-emerald-500" : "text-red-500")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{toast.title}</span>
        {toast.body && <span className="mt-0.5 block text-xs text-muted-foreground">{toast.body}</span>}
      </span>
    </motion.button>
  );
}
