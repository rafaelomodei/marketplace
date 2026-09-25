import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconTile, type TileTone } from "../atoms/Icon";

export function EmptyState({
  icon,
  tone = "sun",
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  tone?: TileTone;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-panel bg-surface px-6 py-14 text-center", className)}>
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-lg tracking-[-0.02em] text-ink-strong">{title}</h3>
        {description && <p className="text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
