import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, ROOT, SKILL_FILE } from "./paths";

/** Reference photo from the store: a printed part, the spool side (pure color) or the spool. */
export type FilamentImage = { role: "part" | "spool-side" | "spool-part" | "spool"; file: string };
export type Filament = {
  id: string;
  name: string;
  line: string;
  lineId: string;
  hex: string | null;
  hexOverride?: string;
  finish: string;
  tags?: string[];
  url?: string;
  images: FilamentImage[];
};
export type FilamentLine = { id: string; name: string; finish: string; url: string };
export type FilamentCatalog = { brand: string; note?: string; syncedAt?: string; lines: FilamentLine[]; filaments: Filament[] };
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

/**
 * Photos sent to Codex as color/finish reference for a filament: the printed part (color + texture)
 * and the spool side view (pure color). Only files that exist locally (see scripts/sync-voolt3d.mjs).
 */
export function filamentRefFiles(f: Filament): string[] {
  const pick = (role: FilamentImage["role"]) => f.images.find((i) => i.role === role)?.file;
  return [pick("part") ?? pick("spool-part"), pick("spool-side") ?? pick("spool")]
    .filter((file): file is string => !!file && fs.existsSync(path.join(ROOT, file)));
}

/** The generation rules sent to Codex with every job (frontmatter stripped). Read on each job so edits apply at once. */
export function generationSkill(): string {
  return fs.readFileSync(SKILL_FILE, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}
