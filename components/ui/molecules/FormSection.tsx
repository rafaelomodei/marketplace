import { cn } from "@/lib/cn";

/** A titled block of a form: title, one-line hint above, then the controls (pickers, grids, fields). */
export function FormSection({
  title,
  hint,
  optional,
  children,
  className,
}: {
  title: string;
  hint?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <h3 className="flex items-baseline gap-2 text-lg tracking-[-0.02em] text-ink-strong">
          {title}
          {optional && <span className="text-xs text-ink-faint">opcional</span>}
        </h3>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
