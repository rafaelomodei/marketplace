import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon, IconTile, type TileTone } from "../atoms/Icon";

/** Big selectable card: icon, title, one-line explanation. For choosing "what to do". */
export function OptionCard({
  icon,
  tone,
  title,
  description,
  selected,
  onSelect,
  badge,
}: {
  icon: LucideIcon;
  tone?: TileTone;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group relative flex h-full flex-col gap-4 rounded-card p-5 text-left transition",
        selected ? "bg-canvas shadow-float ring-2 ring-ink-strong" : "bg-surface ring-1 ring-transparent hover:bg-canvas hover:ring-line-strong",
      )}
    >
      <div className="flex items-start justify-between">
        <IconTile icon={icon} tone={tone} />
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full transition",
            selected ? "bg-ink-strong text-white" : "ring-1 ring-line-strong ring-inset",
          )}
        >
          {selected && <Icon icon={Check} className="size-3" />}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium tracking-[-0.01em] text-ink-strong">
          {title}
          {badge}
        </div>
        <p className="text-sm leading-relaxed text-ink-muted">{description}</p>
      </div>
    </button>
  );
}
