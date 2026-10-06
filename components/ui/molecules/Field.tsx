import { cn } from "@/lib/cn";
import { Badge } from "../atoms/Badge";

const STATUS = {
  suggested: { tone: "accent", text: "Sugerido pela IA" },
  missing: { tone: "danger", text: "Falta preencher" },
} as const;
/** Highlight for the control inside a Field with the same `status`. */
export const fieldStatusClass = { suggested: "ring-2 ring-lake bg-sky/25", missing: "ring-1 ring-danger" } as const;
export type FieldStatus = keyof typeof STATUS;

/**
 * Label + control + optional hint. Use `as="div"` around groups of buttons (ChoiceGroup, pickers):
 * a <label> would forward clicks on its text to the first button.
 * `status` flags a value that still needs the user's eyes (filled automatically, or required and empty);
 * pair it with `fieldStatusClass[status]` on the control.
 */
export function Field({
  label,
  hint,
  optional,
  required,
  status,
  as: Tag = "label",
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  optional?: boolean;
  required?: boolean;
  status?: FieldStatus;
  as?: "label" | "div";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag className={cn("block space-y-2", className)}>
      <span className="flex items-baseline gap-2 text-sm font-medium text-ink-strong">
        {label}
        {required && <span aria-hidden="true" className="text-danger">*</span>}
        {optional && <span className="text-xs font-normal text-ink-faint">opcional</span>}
        {status && <Badge tone={STATUS[status].tone} dot className="ml-auto self-center">{STATUS[status].text}</Badge>}
      </span>
      {children}
      {hint && <span className="block text-xs leading-relaxed text-ink-muted">{hint}</span>}
    </Tag>
  );
}
