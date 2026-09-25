import { Check, Maximize2, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

/**
 * Image in a rounded frame. Selectable (check in the corner), zoomable, removable.
 * `ratio` controls the frame; the image is always fully visible (object-contain).
 */
export function ImageTile({
  src,
  alt = "",
  selected,
  onSelect,
  onZoom,
  onRemove,
  ratio = "square",
  caption,
  className,
}: {
  src: string;
  alt?: string;
  selected?: boolean;
  onSelect?: () => void;
  onZoom?: () => void;
  onRemove?: () => void;
  ratio?: "square" | "portrait" | "landscape";
  caption?: React.ReactNode;
  className?: string;
}) {
  const aspect = { square: "aspect-square", portrait: "aspect-[3/4]", landscape: "aspect-[4/3]" }[ratio];
  const main = onSelect ?? onZoom;
  return (
    <figure className={cn("group relative", className)}>
      <div
        role={main ? "button" : undefined}
        tabIndex={main ? 0 : undefined}
        onClick={main}
        onKeyDown={(e) => main && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), main())}
        className={cn(
          "relative overflow-hidden rounded-card bg-surface transition",
          aspect,
          main && "cursor-pointer",
          onSelect && !onZoom && "cursor-pointer",
          !onSelect && onZoom && "cursor-zoom-in",
          selected ? "ring-2 ring-ink-strong ring-offset-2" : "ring-1 ring-line ring-inset",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="size-full object-contain transition duration-500 group-hover:scale-[1.02]" />
        {onSelect && (
          <span
            className={cn(
              "absolute top-2.5 left-2.5 grid size-6 place-items-center rounded-full transition",
              selected ? "bg-ink-strong text-white" : "bg-canvas/80 opacity-0 ring-1 ring-black/10 backdrop-blur group-hover:opacity-100",
            )}
          >
            {selected && <Icon icon={Check} className="size-3.5" />}
          </span>
        )}
        <span className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          {onZoom && onSelect && <TileAction label="Ampliar" icon={Maximize2} onClick={onZoom} />}
          {onRemove && <TileAction label="Excluir" icon={Trash2} onClick={onRemove} danger />}
        </span>
      </div>
      {caption && <figcaption className="mt-2 text-xs text-ink-muted">{caption}</figcaption>}
    </figure>
  );
}

function TileAction({ label, icon, onClick, danger }: { label: string; icon: typeof Check; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("grid size-7 place-items-center rounded-full bg-canvas/90 shadow-float backdrop-blur", danger ? "text-danger" : "text-ink-strong")}
    >
      <Icon icon={icon} className="size-3.5" />
    </button>
  );
}
