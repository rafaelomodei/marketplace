"use client";

import { FilamentPicker } from "@/components/studio";
import { Disclosure, Swatch } from "@/components/ui";
import type { Filament, FilamentCatalog } from "@/lib/config";
import { filamentHex } from "@/lib/prompts";

export type PartColor = { filamentId: string | null; hex: string };

/** Filament whose color is closest to a hex — used to pick sensible default colors per part. */
export function nearestFilament(catalog: FilamentCatalog, hex: string): Filament | undefined {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best: Filament | undefined;
  let bestD = Infinity;
  for (const f of catalog.filaments) {
    const [fr, fg, fb] = rgb(filamentHex(f));
    const d = (r - fr) ** 2 + (g - fg) ** 2 + (b - fb) ** 2;
    if (d < bestD) [best, bestD] = [f, d];
  }
  return best;
}

/** Color of one printed part, chosen from the real filament catalog. */
export function PartColorField({
  label,
  catalog,
  value,
  onChange,
}: {
  label: string;
  catalog: FilamentCatalog;
  value: PartColor;
  onChange: (v: PartColor) => void;
}) {
  const filament = catalog.filaments.find((f) => f.id === value.filamentId);
  return (
    <Disclosure
      className="rounded-xl bg-surface px-3 py-2.5"
      summary={
        <span className="flex flex-1 items-center gap-3 text-ink-strong">
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
