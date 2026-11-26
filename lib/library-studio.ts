import fs from "node:fs";
import { getProject, projectFile, readProjectMeta, updateProject, type SalePrice } from "./library";
import { type Dimensions, renderPreview, stlTriangles, threeMfItems } from "./print-files";
import { productFactsSchema } from "./product-facts";
import { createProduct, getProduct, HttpError, locateProduct, readMeta, saveUpload, writeMeta } from "./products";
import { formatSize } from "./text";

/**
 * The bridge between a print-library project (files, size, costs, prices) and its product in the image studio
 * (photos, generated pictures, listing). One project ↔ one product: the library creates it on first use, with
 * the same name, and both keep a reference to the other (`projeto.json → product`, `product.json → libraryProject`).
 */

/** The linked studio product, if it still exists. */
export function linkedProduct(project: string): string | null {
  const slug = readProjectMeta(project).product;
  return slug && locateProduct(slug) ? slug : null;
}

/** What the library knows about the finished object, for the studio. */
export type LibraryFacts = {
  project: string;
  name: string;
  size: Dimensions | null;
  pieces: number | null;
  salePrices: SalePrice[];
  /** Filament per finished object (grams) and cost/suggested price per object, from the first ready file. */
  grams: number | null;
  unitCost: number | null;
  suggested: number | null;
  /** Sizes/features sold side by side (empty = a single product), with cost, suggested and own price of one unit. */
  variations: { title: string; size: string; feature: string; unitCost: number | null; suggested: number | null; price: number | null }[];
  /** Colours with a different filament price. */
  colors: string[];
};

export function libraryFacts(project: string): LibraryFacts {
  const p = getProject(project);
  const done = p.files.map((f) => (f.folder === "print" && f.slice?.status === "done" ? f.slice : null)).find(Boolean) ?? null;
  return {
    project,
    name: p.name,
    size: p.object.size,
    pieces: p.object.pieces,
    salePrices: p.salePrices,
    grams: done ? Math.round((done.stats.grams.reduce((a, b) => a + b, 0) / done.cost.units) * 10) / 10 : null,
    unitCost: done?.cost.total ?? null,
    suggested: done?.cost.price ?? null,
    variations: p.variations.map((v) => ({
      title: v.title,
      size: v.size,
      feature: v.feature,
      unitCost: v.cost?.total ?? null,
      suggested: v.cost?.price ?? null,
      price: v.salePrices.find((t) => t.quantity === 1)?.price ?? null,
    })),
    colors: p.colors.map((c) => c.name),
  };
}

/** Fills the product sheet with what the library knows, only where the seller has not written anything yet. */
function fillFacts(product: string, facts: LibraryFacts) {
  const parsed = productFactsSchema.safeParse(readMeta(product).facts ?? {});
  if (!parsed.success) return;
  const f = parsed.data;
  const unit = facts.salePrices.find((t) => t.quantity === 1)?.price;
  let changed = false;
  if (!f.identification.dimensions && facts.size) {
    f.identification.dimensions = { width: facts.size.width, length: facts.size.depth, height: facts.size.height, unit: "mm" };
    changed = true;
  }
  if (!f.sale.priceBRL && unit) {
    f.sale.priceBRL = unit;
    changed = true;
  }
  if (changed) writeMeta(product, { facts: f });
}

/** The linked product, creating it (same name, sheet pre-filled with size and price) when there is none yet. */
export function ensureStudioProduct(project: string): string {
  const existing = linkedProduct(project);
  const facts = libraryFacts(project);
  if (existing) {
    fillFacts(existing, facts);
    return existing;
  }
  const slug = createProduct(facts.name, { libraryProject: project }, { unique: true });
  fillFacts(slug, facts);
  updateProject(project, { product: slug });
  return slug;
}

/** For the library page: the linked product and its product photos. */
export function studioSummary(project: string) {
  const slug = linkedProduct(project);
  if (!slug) return { product: null, photos: [], generated: 0 };
  const p = getProduct(slug);
  return {
    product: slug,
    photos: p.images.filter((i) => i.kind === "real").map((i) => ({ id: i.id, rel: i.rel })),
    generated: p.images.filter((i) => i.kind === "approved").length,
  };
}

const VIEWS = [
  { name: "frente", azimuth: -30, elevation: 25 },
  { name: "lado", azimuth: 60, elevation: 20 },
  { name: "costas", azimuth: 150, elevation: 25 },
  { name: "cima", azimuth: -30, elevation: 70 },
];

/**
 * Renders the 3D model from four angles and adds the pictures to the product photos, so the image AI sees the
 * exact shape. Only for a model that is a single piece (a cut-up model would show loose parts).
 */
export async function addModelViews(project: string) {
  const p = getProject(project);
  const measured = p.object.measured;
  if (!measured || measured.pieces !== 1) throw new HttpError(400, "Só dá para usar o modelo 3D quando o arquivo tem uma única peça (objeto já montado)");
  const file = p.files.find((f) => f.rel === measured.file)!;
  const data = fs.readFileSync(projectFile(project, measured.file));
  const soup = file.type === "stl" ? stlTriangles(data) : threeMfItems(data)[0];
  const color = file.info?.filaments[0]?.color;
  const slug = ensureStudioProduct(project);
  const saved = [];
  for (const v of VIEWS) {
    const png = await renderPreview(soup, color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#8fb39a", 1024, v, "#ffffff");
    saved.push(saveUpload(slug, "real", `modelo-3d-${v.name}.png`, png));
  }
  return { product: slug, saved };
}

/** A line for image prompts: the real size of the object, so scenes keep the right scale. */
export function promptSizeNote(libraryProject: string | undefined): string {
  if (!libraryProject) return "";
  try {
    const f = libraryFacts(libraryProject);
    if (!f.size) return "";
    return `Tamanho real do objeto montado: ${formatSize(f.size)} (largura × comprimento × altura). Mantenha essa escala em relação às mãos, móveis e objetos da cena.`;
  } catch {
    return "";
  }
}
