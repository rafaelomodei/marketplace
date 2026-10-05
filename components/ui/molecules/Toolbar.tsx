import { cn } from "@/lib/cn";

/** Floating pill of tool buttons (editors). Vertical by default. */
export function Toolbar({ vertical = true, className, children, label }: { vertical?: boolean; className?: string; children: React.ReactNode; label: string }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn("flex gap-0.5 rounded-2xl bg-canvas/85 p-1 shadow-float ring-1 ring-black/5 backdrop-blur-xl", vertical ? "flex-col" : "flex-row", className)}
    >
      {children}
    </div>
  );
}

/** Thin line between groups of tools. */
export function ToolDivider({ vertical = true }: { vertical?: boolean }) {
  return <span aria-hidden className={cn("shrink-0 bg-line", vertical ? "mx-1.5 my-1 h-px" : "mx-1 my-1.5 w-px")} />;
}

/** Square tool button with an active state; the title doubles as tooltip and accessible name. */
export function ToolButton({
  active,
  title,
  shortcut,
  className,
  children,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> & { active?: boolean; title: string; shortcut?: string }) {
  return (
    <button
      type="button"
      title={shortcut ? `${title} (${shortcut})` : title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "grid size-10 place-items-center rounded-xl transition disabled:pointer-events-none disabled:opacity-30",
        active ? "bg-ink-strong text-white" : "text-ink-soft hover:bg-surface hover:text-ink-strong",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
