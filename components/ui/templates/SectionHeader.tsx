import { cn } from "@/lib/cn";
import { Badge } from "../atoms/Badge";
import { Heading, Lead } from "../atoms/Text";

/** Eyebrow chip + light headline + muted lead, with an optional action on the right. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  size = "title",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "title" | "heading";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-6", className)}>
      <div className="max-w-2xl space-y-4">
        {eyebrow && <Badge dot tone="accent">{eyebrow}</Badge>}
        <Heading size={size}>{title}</Heading>
        {description && <Lead className={size === "heading" ? "text-base" : undefined}>{description}</Lead>}
      </div>
      {action}
    </div>
  );
}
