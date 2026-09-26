import type { Filament, FilamentCatalog } from "../config";
import { filamentHex } from "../prompts";

/** Filament whose color is closest to a hex — sensible default colors per part (editor and server alike). */
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
