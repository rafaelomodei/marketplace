import { cn } from "@/lib/cn";

/**
 * Label + control + optional hint. Use `as="div"` around groups of buttons (ChoiceGroup, pickers):
 * a <label> would forward clicks on its text to the first button.
 */
export function Field({
  label,
  hint,
  optional,
  as: Tag = "label",
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  optional?: boolean;
  as?: "label" | "div";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag className={cn("block space-y-2", className)}>
      <span className="flex items-baseline gap-2 text-sm font-medium text-ink-strong">
        {label}
        {optional && <span className="text-xs font-normal text-ink-faint">opcional</span>}
      </span>
      {children}
      {hint && <span className="block text-xs leading-relaxed text-ink-muted">{hint}</span>}
    </Tag>
  );
}
