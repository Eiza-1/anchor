// Anchor's UI kit: shadcn/ui shapes (button, card, switch, input, select,
// progress, badge, alert, tabs, skeleton, dialog) restyled as frosted glass
// with cut corners, glowing primary buttons, chip tabs and spring motion.
// Glass utilities (.glass, .glass-strong, .cut-corner, .glow) live in index.css.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { INSTANT, SPRING, SPRING_SOFT, useReduceMotion } from "@/lib/motion";
import { Check, Loader2 } from "lucide-react";

/* ---------------- Button ---------------- */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[transform,box-shadow,background-color,color,opacity] duration-spring ease-spring [.reduce-motion_&]:transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // glowing accent, lifts 1px on hover
        default:
          "glow bg-primary font-semibold text-primary-foreground hover:-translate-y-px hover:bg-primary/90 hover:shadow-[0_0_32px_hsl(var(--primary)/0.6)] active:translate-y-0",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_0_20px_hsl(var(--destructive)/0.4)] hover:-translate-y-px hover:bg-destructive/90 active:translate-y-0",
        outline: "glass text-foreground hover:-translate-y-px hover:bg-accent/70 active:translate-y-0",
        secondary: "glass text-secondary-foreground hover:-translate-y-px hover:bg-accent/70 active:translate-y-0",
        ghost: "hover:bg-accent/70 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

/* ---------------- Card ---------------- */
export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("glass cut-corner rounded-lg text-card-foreground", className)} {...props} />
);
export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
);
export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
);
/** One line by default; a "More" toggle appears only when the text overflows. */
export function CardDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollWidth > el.clientWidth + 1);
  });
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <p
        ref={ref}
        className={cn("min-w-0 flex-1 text-sm text-muted-foreground", !open && "truncate", className)}
        {...props}
      >
        {children}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-6 pt-0", className)} {...props} />
);
export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
);

/* ---------------- Page title ---------------- */
/** A page's heading, matching Home's greeting: bold, with a soft shadow over the picture. */
export const PageTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h1 className={cn("text-4xl font-bold tracking-tight dark:[text-shadow:0_2px_20px_rgb(0_0_0/0.4)]", className)} {...props} />
);

/* ---------------- Switch ---------------- */
export function Switch({
  checked, onCheckedChange, disabled, className, title,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      title={title}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.45)]" : "bg-foreground/15",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-spring ease-spring [.reduce-motion_&]:transition-none",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

/* ---------------- Checkbox ---------------- */
// A glass box that fills with the accent and springs a tick in when checked.
// The native input stays (keyboard, labels, forms); only its look is replaced.
export function Checkbox({
  checked, onCheckedChange, className,
}: { checked: boolean; onCheckedChange: (v: boolean) => void; className?: string }) {
  return (
    <span className={cn("relative inline-grid size-4 shrink-0 place-items-center", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="peer size-4 cursor-pointer appearance-none rounded-[5px] border border-foreground/25 bg-[hsl(var(--glass))] shadow-sm transition-[background-color,border-color,box-shadow] hover:border-foreground/45 checked:border-primary checked:bg-primary checked:shadow-[0_0_10px_hsl(var(--primary)/0.45)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Check
        strokeWidth={3.5}
        className="pointer-events-none absolute size-3 scale-50 text-primary-foreground opacity-0 transition-[opacity,transform] duration-spring ease-spring peer-checked:scale-100 peer-checked:opacity-100"
      />
    </span>
  );
}

/* ---------------- Input / Label ---------------- */
// (Input and Select keep a faint 1px border on a glass fill: a field needs a visible edge.)
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-foreground/15 bg-[hsl(var(--glass))] px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-sm font-medium leading-none", className)} {...props} />
);

/* ---------------- Select ---------------- */
export const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={cn(
      "flex h-9 w-full items-center rounded-full border border-foreground/15 bg-[hsl(var(--glass))] px-3 py-1 text-sm shadow-sm transition-colors hover:border-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring [&>option]:bg-background",
      className
    )}
    {...props}
  >
    {children}
  </select>
);

/* ---------------- Progress ---------------- */
export function Progress({ value, className }: { value: number; className?: string }) {
  const reduce = useReduceMotion();
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-foreground/10", className)}>
      <motion.div
        className="h-full rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]"
        initial={false}
        animate={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}
        transition={reduce ? INSTANT : SPRING_SOFT}
      />
    </div>
  );
}

/* ---------------- Badge ---------------- */
// (Badges keep a border: it is tinted per variant, not the old flat panel edge.)
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/50 bg-primary/15 text-primary",
        secondary: "border-foreground/10 bg-[hsl(var(--glass))] text-secondary-foreground",
        destructive: "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400",
        outline: "border-foreground/25 text-foreground",
        success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);
export const Badge = ({
  className, variant, ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);

/* ---------------- Alert ---------------- */
// (Status alerts keep a tinted border + fill so their colour reads as meaning; default is glass.)
export function Alert({
  variant = "default", className, children,
}: { variant?: "default" | "destructive" | "warning" | "success"; className?: string; children: React.ReactNode }) {
  const styles = {
    default: "glass border-transparent text-foreground",
    destructive: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  }[variant];
  return (
    <div className={cn("relative w-full rounded-lg border px-4 py-3 text-sm", styles, className)}>
      {children}
    </div>
  );
}
export const AlertTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h5 className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
);
export const AlertDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <div className={cn("text-sm [&_p]:leading-relaxed opacity-90", className)} {...props} />
);

/* ---------------- Tabs (controlled chip row, sliding pill) ---------------- */
export function Tabs({
  value, onValueChange, options, className, id,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  /** Scopes the sliding pill; defaults to a per-instance id. */
  id?: string;
}) {
  const autoId = React.useId();
  const pillId = `tabs-indicator-${id ?? autoId}`;
  return (
    <div role="tablist" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "relative inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              on
                ? "border-transparent text-primary-foreground dark:text-primary"
                : "border-foreground/15 bg-[hsl(var(--glass))] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            )}
          >
            {on && (
              <motion.span
                layoutId={pillId}
                transition={SPRING}
                className="absolute -inset-px rounded-full border border-primary bg-primary shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.5)] dark:bg-primary/15 dark:shadow-[inset_0_0_10px_hsl(var(--primary)/0.35),0_0_14px_hsl(var(--primary)/0.25)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Skeleton / Separator ---------------- */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-md bg-foreground/[0.07]", className)} />
);
export const Separator = ({ className }: { className?: string }) => (
  <div className={cn("h-px w-full shrink-0 bg-border", className)} />
);

/* ---------------- Dialog (minimal modal) ---------------- */
export function Dialog({
  open, onClose, title, description, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="glass-strong cut-corner w-full max-w-lg rounded-lg p-6"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
            transition={SPRING}
          >
            <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
            {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
            {children && <div className="mt-4 max-h-64 overflow-y-auto text-sm">{children}</div>}
            <div className="mt-6 flex justify-end gap-2">{footer}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
