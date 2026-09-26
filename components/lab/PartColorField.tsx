"use client";

import { ArrowRight } from "lucide-react";
import { FilamentPicker } from "@/components/studio";
import { Disclosure, Icon, Swatch } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { FilamentCatalog } from "@/lib/config";
import { nearestFilament } from "@/lib/lab/filament-match";
import { filamentHex } from "@/lib/prompts";

export { nearestFilament };

export type PartColor = { filamentId: string | null; hex: string };

/** Color of one printed part, chosen from the real filament catalog. `source` shows the color it replaces (e.g. from a drawing). */
export function PartColorField({
  label,
  catalog,
  value,
  onChange,
  source,
  className,
}: {
  label: string;
  catalog: FilamentCatalog;
  value: PartColor;
  onChange: (v: PartColor) => void;
  source?: string;
  className?: string;
}) {
  const filament = catalog.filaments.find((f) => f.id === value.filamentId);
  return (
    <Disclosure
      className={cn("rounded-xl bg-surface px-3 py-2.5", className)}
      summary={
        <span className="flex min-w-0 flex-1 items-center gap-3 text-ink-strong">
          {source && (
            <span className="flex items-center gap-1.5" title={`Cor no desenho: ${source}`}>
              <Swatch color={source} className="size-5" />
              <Icon icon={ArrowRight} className="size-3.5 text-ink-faint" />
            </span>
          )}
          <Swatch color={value.hex} className="size-7" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{label}</span>
            <span className="block truncate text-xs text-ink-muted">{filament ? `${filament.name} · ${filament.line}` : value.hex}</span>
          </span>
          <span className="text-xs text-ink-muted">Trocar</span>
        </span>
      }
    >
      <FilamentPicker
        catalog={catalog}
        selected={value.filamentId ? [value.filamentId] : []}
        onToggle={(id) => {
          const f = catalog.filaments.find((x) => x.id === id);
          if (f) onChange({ filamentId: f.id, hex: filamentHex(f) });
        }}
      />
    </Disclosure>
  );
}
