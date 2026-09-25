"use client";

import { useState } from "react";
import { ChoiceGroup, Swatch } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Filament, FilamentCatalog } from "@/lib/config";
import { filamentHex } from "@/lib/prompts";

/** URL of a filament's local reference photo (paths in the catalog start with assets/filaments/). */
export const filamentPhoto = (f: Filament, w = 160) => {
  const img = f.images.find((i) => i.role === "part") ?? f.images.find((i) => i.role === "spool-side") ?? f.images[0];
  return img ? `/filament-assets/${img.file.replace(/^assets\/filaments\//, "")}?w=${w}` : null;
};

/** Filament chooser grouped by product line (Velvet, V-Silk, Stone…), showing the real printed-part photo. */
export function FilamentPicker({
  catalog,
  selected,
  onToggle,
}: {
  catalog: FilamentCatalog;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const firstSelectedLine = catalog.filaments.find((f) => selected.includes(f.id))?.lineId;
  const [lineId, setLineId] = useState(firstSelectedLine ?? catalog.lines[0]?.id ?? "");
  const line = catalog.lines.find((l) => l.id === lineId);
  const colors = catalog.filaments.filter((f) => f.lineId === lineId);
  const chosen = catalog.filaments.filter((f) => selected.includes(f.id));

  return (
    <div className="space-y-4">
      <ChoiceGroup
        value={lineId}
        onChange={setLineId}
        options={catalog.lines.map((l) => {
          const count = catalog.filaments.filter((f) => f.lineId === l.id && selected.includes(f.id)).length;
          return {
            value: l.id,
            label: (
              <>
                {l.name.replace(/^PLA /, "")}
                {count > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] text-ink-strong">{count}</span>}
              </>
            ),
          };
        })}
      />
      {line && <p className="text-xs text-ink-muted">Acabamento: {line.finish}</p>}
      <div className="flex flex-wrap gap-1.5">
        {colors.map((f) => {
          const on = selected.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              title={`${f.line} · ${filamentHex(f)}`}
              onClick={() => onToggle(f.id)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-full pr-3 pl-1.5 text-xs transition",
                on ? "bg-ink-strong text-white" : "bg-canvas text-ink-soft ring-1 ring-line-strong ring-inset hover:ring-ink-faint",
              )}
            >
              <Swatch color={filamentHex(f)} className="size-5" />
              {f.name}
            </button>
          );
        })}
      </div>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-3 border-t border-line pt-4">
          {chosen.map((f) => {
            const photo = filamentPhoto(f);
            return (
              <div key={f.id} className="w-20 space-y-1.5 text-[11px] leading-tight">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="size-20 rounded-xl bg-surface object-cover ring-1 ring-line" />
                ) : (
                  <div className="size-20 rounded-xl ring-1 ring-line" style={{ background: filamentHex(f) }} />
                )}
                <span className="block text-ink-strong">{f.name}</span>
                <span className="block text-ink-muted">{f.line.replace(/^PLA /, "")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
