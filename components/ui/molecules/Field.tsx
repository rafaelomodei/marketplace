import { cn } from "@/lib/cn";

/** Label + control + optional hint. Wrap any input, choice group or picker. */
export function Field({
  label,
  hint,
  optional,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="flex items-baseline gap-2 text-sm font-medium text-ink-strong">
        {label}
        {optional && <span className="text-xs font-normal text-ink-faint">opcional</span>}
      </span>
      {children}
      {hint && <span className="block text-xs leading-relaxed text-ink-muted">{hint}</span>}
    </label>
  );
}
