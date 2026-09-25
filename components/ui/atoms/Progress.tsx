import { cn } from "@/lib/cn";

/** Thin bar. Without `value` it loops (work of unknown length, like an AI job). */
export function Progress({ value, className }: { value?: number; className?: string }) {
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-panel", className)}>
      {value === undefined ? (
        <div className="h-full w-2/5 animate-progress rounded-full bg-gradient-to-r from-peach via-rose to-lilac" />
      ) : (
        <div className="h-full rounded-full bg-ink-strong transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
      )}
    </div>
  );
}
