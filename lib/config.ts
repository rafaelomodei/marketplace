import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_DIR,
  FACTS_ASSIST_SKILL_FILE,
  ROOT,
  SKILL_FILE,
  SOCIAL_DIRECTION_FILE,
  SOCIAL_LOGO_DIR,
  SOCIAL_REFERENCE_FILE,
  SOCIAL_SKILL_FILE,
} from "./paths";

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
export type Marketplace = { name: string; targets: ExportTarget[]; listingRules?: { source: string; verifiedAt: string; status: "needs-seller-confirmation" | "verified"; note: string } };
export type SocialBrandAsset = { file: string; label: string; use: string };

const SOCIAL_BRAND_ASSETS = [
  {
    file: "logo-verdeforma.png",
    label: "LOGO OFICIAL HORIZONTAL",
    use: "usar em fundo escuro ou verde, quando houver largura para a assinatura completa",
  },
  {
    file: "logo-verdeforma-coluna.png",
    label: "LOGO OFICIAL EM COLUNA",
    use: "usar em fundo escuro ou verde, quando a composição pedir uma assinatura mais compacta",
  },
  {
    file: "icon-logo-verdeforma.png",
    label: "BRASÃO OFICIAL TRANSPARENTE",
    use: "variante padrão para fundo claro e uniforme",
  },
  {
    file: "icon-verdeforma.png",
    label: "ÍCONE OFICIAL EM BASE BRANCA",
    use: "usar sobre fotografia ou fundo visualmente movimentado para preservar contraste",
  },
] as const;

export const SOCIAL_BRAND_ASSET_COUNT = SOCIAL_BRAND_ASSETS.length;

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

/** Verde Forma brand and layout rules, loaded only for social-media jobs. */
export function socialGenerationSkill(): string {
  const identity = fs.readFileSync(SOCIAL_SKILL_FILE, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  const direction = fs.readFileSync(SOCIAL_DIRECTION_FILE, "utf8").trim();
  return [
    "# CAMADA 1 — IDENTIDADE GLOBAL DA VERDE FORMA",
    identity,
    "---",
    "# CAMADA 2 — DIREÇÃO DE ARTE OPERACIONAL (FONTE DE VERDADE PRINCIPAL)",
    "Esta camada decide como construir a composição. Em divergências estéticas ou de layout, ela prevalece sobre a camada global. Fidelidade ao produto, texto confirmado e assets oficiais continuam invioláveis.",
    direction,
  ].join("\n\n");
}

/** Canonical visual board attached to every social job; text rules alone cannot lock visual identity. */
export function socialStyleReferenceFiles(): string[] {
  return fs.existsSync(SOCIAL_REFERENCE_FILE) ? [SOCIAL_REFERENCE_FILE] : [];
}

/** Official rasterized logos attached to every social job, in prompt order. */
export function socialBrandAssets(): SocialBrandAsset[] {
  return SOCIAL_BRAND_ASSETS.map((asset) => ({ ...asset, file: path.join(SOCIAL_LOGO_DIR, asset.file) }))
    .filter((asset) => fs.existsSync(asset.file));
}

/** Rules used by the structured product-facts assistant. */
export function factsAssistSkill(): string {
  return fs.readFileSync(FACTS_ASSIST_SKILL_FILE, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}
