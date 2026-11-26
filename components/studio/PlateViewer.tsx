"use client";

import { ChevronLeft, ChevronRight, Box } from "lucide-react";
import { useState } from "react";
import { Icon, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { libraryPictureUrl } from "@/lib/client/api";

/** A picture in the viewer when it goes through a list instead of the plates of one file. */
export type ViewerPicture = { key: string; src: string; label?: string };

/**
 * Static picture of a print file: the plate pictures saved by the slicer, with arrows to go through the plates,
 * or a render of the model for STL / 3MF without pictures. `version` busts the cache when the file changes.
 *
 * With `pictures` it goes through that list instead (cover, plates of several files, photos…). `total` +
 * `loadPictures` show the arrows from the start but only fetch the list on the first click (library cards).
 */
export function PlateViewer({
  slug,
  file,
  plates = [],
  version,
  plate: controlled,
  onPlate,
  pictures,
  total,
  loadPictures,
  index: controlledIndex,
  onIndex,
  compact,
  width = 640,
  className,
  children,
}: {
  slug: string;
  file?: string;
  plates?: { plate: number; name: string | null }[];
  version?: string;
  plate?: number;
  onPlate?: (plate: number) => void;
  pictures?: ViewerPicture[];
  /** How many pictures there are once `loadPictures` runs. */
  total?: number;
  loadPictures?: () => Promise<ViewerPicture[]>;
  index?: number;
  onIndex?: (index: number) => void;
  /** Small frame (cards): just "2/5" instead of the picture name. */
  compact?: boolean;
  width?: number;
  className?: string;
  /** Overlay over the picture (badges, buttons). */
  children?: React.ReactNode;
}) {
  const [own, setOwn] = useState(plates[0]?.plate ?? 1);
  const [ownIndex, setOwnIndex] = useState(0);
  const [loaded, setLoaded] = useState<ViewerPicture[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const list = loaded ?? pictures;
  const current = controlled ?? own;
  const plateIndex = Math.max(0, plates.findIndex((p) => p.plate === current));
  const index = list ? Math.min(Math.max(0, controlledIndex ?? ownIndex), Math.max(0, list.length - 1)) : plateIndex;
  const count = list ? Math.max(list.length, loaded ? 0 : (total ?? 0)) : plates.length;
  const picture = list?.[index];
  const src = list ? (picture?.src ?? "") : file ? libraryPictureUrl(slug, file, current, width, version) : "";

  async function go(delta: number) {
    if (!list) {
      const next = plates[(plateIndex + delta + plates.length) % plates.length].plate;
      setOwn(next);
      onPlate?.(next);
      return;
    }
    let all = list;
    if (!loaded && loadPictures && count > list.length) {
      setLoading(true);
      try {
        all = await loadPictures();
        setLoaded(all);
      } catch {
        return;
      } finally {
        setLoading(false);
      }
    }
    if (all.length < 2) return;
    const next = (index + delta + all.length) % all.length;
    setOwnIndex(next);
    onIndex?.(next);
  }

  // Arrows live inside clickable cards: never let the click open what is around them.
  const click = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void go(delta);
  };
  const arrow = cn(
    "absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full bg-canvas/85 text-ink-strong shadow-float opacity-0 transition group-hover/plates:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100",
    compact ? "size-7" : "size-8",
  );
  const caption = list
    ? compact
      ? `${index + 1}/${count}`
      : `${picture?.label ? `${picture.label} · ` : ""}${index + 1} de ${count}`
    : `Mesa ${index + 1} de ${plates.length}${plates[index]?.name ? ` · ${plates[index].name}` : ""}`;

  return (
    <div className={cn("group/plates relative aspect-square overflow-hidden rounded-card bg-surface ring-1 ring-line ring-inset", className)}>
      {!src || failed === src ? (
        <div className="grid size-full place-items-center text-ink-faint"><Icon icon={Box} className="size-8" /></div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt={picture?.label ?? ""} loading="lazy" onError={() => setFailed(src)} className="size-full object-contain" />
      )}
      {children}
      {count > 1 && (
        <>
          <button type="button" aria-label={list ? "Imagem anterior" : "Mesa anterior"} onClick={click(-1)} className={cn(arrow, compact ? "left-1.5" : "left-2")}>
            <Icon icon={ChevronLeft} />
          </button>
          <button type="button" aria-label={list ? "Próxima imagem" : "Próxima mesa"} onClick={click(1)} className={cn(arrow, compact ? "right-1.5" : "right-2")}>
            {loading ? <Spinner className="size-3.5" /> : <Icon icon={ChevronRight} />}
          </button>
          <span
            className={cn(
              "absolute bottom-2 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 truncate rounded-full bg-canvas/85 text-ink-soft shadow-float",
              compact ? "px-2 py-0.5 text-[11px] tabular-nums opacity-0 transition group-hover/plates:opacity-100 [@media(hover:none)]:opacity-100" : "px-2.5 py-0.5 text-xs",
            )}
          >
            {caption}
          </span>
        </>
      )}
    </div>
  );
}
