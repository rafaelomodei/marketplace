import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./paths";

export type Filament = { id: string; name: string; line: string; hex: string; finish?: string };
export type FilamentCatalog = { brand: string; note?: string; filaments: Filament[] };
export type ExportTarget = { id: string; label: string; width: number; height: number };
export type Marketplace = { name: string; targets: ExportTarget[] };

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), "utf8")) as T;
}

export const filamentCatalog = () => readJson<FilamentCatalog>("filaments.json");
export const marketplaces = () => readJson<Record<string, Marketplace>>("marketplaces.json");

export function findFilament(id: string): Filament | undefined {
  return filamentCatalog().filaments.find((f) => f.id === id);
}
