"use client";

import { ChevronLeft, ChevronRight, Box } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { libraryPictureUrl } from "@/lib/client/api";

/**
 * Static picture of a print file: the plate pictures saved by the slicer, with arrows to go through the plates,
 * or a render of the model for STL / 3MF without pictures. `version` busts the cache when the file changes.
 */
export function PlateViewer({
  slug,
  file,
  plates = [],
  version,
  plate: controlled,
  onPlate,
  width = 640,
  className,
}: {
  slug: string;
  file: string;
  plates?: { plate: number; name: string | null }[];
  version?: string;
  plate?: number;
  onPlate?: (plate: number) => void;
  width?: number;
  className?: string;
}) {
  const [own, setOwn] = useState(plates[0]?.plate ?? 1);
  const [failed, setFailed] = useState<string | null>(null);
  const current = controlled ?? own;
  const index = Math.max(0, plates.findIndex((p) => p.plate === current));
  const go = (delta: number) => {
    const next = plates[(index + delta + plates.length) % plates.length].plate;
    setOwn(next);
    onPlate?.(next);
  };
  const src = libraryPictureUrl(slug, file, current, width, version);
  const arrow = "absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-canvas/85 text-ink-strong shadow-float opacity-0 transition group-hover/plates:opacity-100 focus:opacity-100";
  return (
    <div className={cn("group/plates relative aspect-square overflow-hidden rounded-card bg-surface ring-1 ring-line ring-inset", className)}>
      {failed === src ? (
        <div className="grid size-full place-items-center text-ink-faint"><Icon icon={Box} className="size-8" /></div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="size-full object-contain" />
      )}
      {plates.length > 1 && (
        <>
          <button type="button" aria-label="Mesa anterior" onClick={(e) => (e.preventDefault(), go(-1))} className={cn(arrow, "left-2")}>
            <Icon icon={ChevronLeft} />
          </button>
          <button type="button" aria-label="Próxima mesa" onClick={(e) => (e.preventDefault(), go(1))} className={cn(arrow, "right-2")}>
            <Icon icon={ChevronRight} />
          </button>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-canvas/85 px-2.5 py-0.5 text-xs text-ink-soft shadow-float">
            Mesa {index + 1} de {plates.length}{plates[index]?.name ? ` · ${plates[index].name}` : ""}
          </span>
        </>
      )}
    </div>
  );
}
