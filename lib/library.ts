import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { colorSurcharge, combineCosts, computeCost, type CostBreakdown, type CostSettings, extraSchema, getCostSettings } from "./costing";
import { type Dimensions, inspect3mf, type Measure, measureModelFile, MODEL_EXT, modelMeshesFile, plateImage, renderPreview, type ThreeMfInfo } from "./print-files";
import { DATA_DIR, DOWNLOADS_DIR, IMAGE_EXT, LIBRARY_DIR, SUBDIRS } from "./paths";
import { HttpError, locateProduct, productFile } from "./products";
import { findSlicer, openInSlicer, sliceFile, type SliceStats } from "./slicer";
import { followsStandard, slugify, standardFileBase } from "./text";

/**
 * The print library: one folder per project under ~/VerdeForma/biblioteca (the filesystem is the source of truth).
 *
 *   <projeto>/projeto.json   name, categories, MakerWorld link, cover, extras
 *   <projeto>/origem/        files as downloaded (STL, 3MF without print settings)
 *   <projeto>/fatiados/      3MF saved by the slicer with printer + filament settings: ready to print
 *   <projeto>/.studio/       cache (file info, slice statistics, pictures) — safe to delete
 *
 * Heavy work (sizing a model, slicing) runs once per version of a file (size + mtime) in a background queue that does
 * one job at a time; requests only read the cache. Pictures are made once per file version and size and kept on disk.
 *
 * File names follow a pattern (see `standardFileBase`): the project name in camelCase plus "_" and the printer for a
 * configured 3MF — vasoColmeia.stl, vasoColmeia_K1Max.3mf — so a file is recognised at a glance inside the slicer.
 */

export const FOLDERS = { source: "origem", print: "fatiados" } as const;
export type FolderKind = keyof typeof FOLDERS;
const CACHE = ".studio";
const TRASH = ".lixeira";

export const salePriceSchema = z.object({
  /** How many finished objects (1 = a single one; 10 = a kit of 10). */
  quantity: z.number().int().positive(),
  /** Price of the whole quantity, in reais. */
  price: z.number().nonnegative(),
});
export type SalePrice = z.infer<typeof salePriceSchema>;

/** Cover from a print file: a plate picture of a 3MF (or the render of an STL). */
export const fileCoverSchema = z.object({ file: z.string().min(1), plate: z.number().int().positive().default(1) });
/** Cover from the linked studio product: a photo sent by the seller (real/…) or an approved image (approved/…). */
export const imageCoverSchema = z.object({ image: z.string().min(1) });
/** The chosen cover; older projects only have the file form. Nothing chosen = the first plate of a ready file. */
export const coverSchema = z.union([fileCoverSchema, imageCoverSchema]);
export type Cover = z.infer<typeof coverSchema>;
export type FileCover = z.infer<typeof fileCoverSchema>;
export const isFileCover = (c: Cover | null | undefined): c is FileCover => !!c && "file" in c;

/** Folders of the studio product a library cover may come from. */
const COVER_IMAGE_DIRS = [SUBDIRS.real, SUBDIRS.approved] as const;

/** Price tiers kept one per quantity, sorted by quantity. */
const salePricesSchema = z.array(salePriceSchema).default([])
  .transform((tiers) => [...new Map(tiers.map((t) => [t.quantity, t])).values()].sort((a, b) => a.quantity - b.quantity));

/**
 * A version of the same product sold side by side: another size (10 cm, 15 cm) and/or another feature (a different
 * base). Each points to the project files that print it — several files are parts printed apart (body + base) and
 * are added up; files for different printers are alternatives. Size and feature combine freely ("15 cm · base redonda").
 */
export const variationSchema = z.object({
  /** Stable id (made from the first title), used by actions. */
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  /** Size label for marketplaces ("10 cm"); empty = none. Filled from the title when it has a measure. */
  size: z.string().trim().default(""),
  /** What else changes ("Base redonda"); empty = none. */
  feature: z.string().trim().default(""),
  /** Paths of the 3MF files (fatiados/…) that print this variation. */
  files: z.array(z.string().min(1)).default([]),
  /** Own sale prices of this variation (same shape as the project's); empty = not priced yet. */
  salePrices: salePricesSchema,
});
export type Variation = z.infer<typeof variationSchema>;

/** A colour on offer whose filament costs something else: perKg = price of its 1 kg roll (null = the normal price). */
export const colorSchema = z.object({ name: z.string().trim().min(1), perKg: z.number().nonnegative().nullable().default(null) });
export type ColorOption = z.infer<typeof colorSchema>;

export const projectMetaSchema = z.object({
  name: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).default([]),
  sourceUrl: z.string().trim().default(""),
  notes: z.string().default(""),
  cover: coverSchema.nullable().catch(null).default(null),
  /** Bought items that go with each piece (key ring, bag, box…), with their unit cost. */
  extras: z.array(extraSchema).default([]),
  /** Assembly/finishing/packing minutes; empty = the default from the cost settings. */
  laborMinutes: z.number().nonnegative().nullable().default(null),
  /**
   * What the finished (assembled) object is actually sold for, per quantity: 1 un. for R$ 15, a kit of 10 for R$ 120…
   * Sorted by quantity; empty = not priced yet. (Older projects kept a price per file: the first becomes 1 un.)
   */
  salePrices: z.preprocess(
    (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.values(v).slice(0, 1).map((price) => ({ quantity: 1, price })) : v),
    salePricesSchema,
  ),
  /** Sizes/features of the same product (see Variation). Empty = a single product, as in older projects. */
  variations: z.array(variationSchema).default([]),
  /** Colours that cost more (or less) than the normal filament; they combine with every variation. */
  colors: z.array(colorSchema).default([]),
  /** Size of the finished object in mm, informed by hand (needed when the model has several pieces). */
  size: z.object({ width: z.number().positive(), depth: z.number().positive(), height: z.number().positive() }).nullable().default(null),
  /** How many printed pieces form ONE finished object, informed by hand (an ornament = photo + frame + bow = 3). */
  pieces: z.number().int().positive().nullable().default(null),
  /** Finished objects each print yields, set by hand, by file path (fatiados/x.3mf → 9). Otherwise: pieces in the file ÷ pieces per object. */
  yields: z.record(z.string(), z.number().int().positive()).default({}),
  /** The product of the image studio made from this project (slug in products/), when linked. */
  product: z.string().nullable().default(null),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type ProjectMeta = z.infer<typeof projectMetaSchema>;

export const DEFAULT_CATEGORIES = ["Casa", "Decoração", "Natal", "Chaveiro", "Brinquedo", "Mesa posta", "Kit", "Utilidades"];

export type SliceState =
  | { status: "done"; stats: SliceStats; cost: CostBreakdown; slicedAt: string }
  | { status: "queued" | "running" }
  | { status: "failed"; error: string }
  | { status: "no-slicer" }
  | { status: "not-configured" };

export type LibraryFile = {
  rel: string;
  name: string;
  folder: FolderKind;
  type: "3mf" | "stl" | "other";
  size: number;
  modifiedAt: string;
  info: ThreeMfInfo | null;
  slice: SliceState | null;
  /** Pieces in the model and, for a single piece, its exact size (null until measured or for other files). */
  measure: Measure | null;
  /** The model is being measured in the background (pieces and size come next). */
  measuring: boolean;
  /** Finished objects one print of this file yields, and where the number came from. */
  units: FileUnits;
  /** The name this file should have by the library pattern, without extension ("vasoColmeia_K1Max"). */
  standardBase: string;
  /** Whether the current name already follows the pattern. */
  standardName: boolean;
};

export type FileUnits = {
  count: number;
  /** "manual" = set by hand; "pieces" = pieces in the file ÷ pieces per object; "default" = assumed 1. */
  source: "manual" | "pieces" | "default";
};

/** 27 pieces on the plate and 3 pieces per object → 9 objects per print. */
export function fileUnits(meta: ProjectMeta, rel: string, measure: Measure | null | undefined): FileUnits {
  if (meta.yields[rel]) return { count: meta.yields[rel], source: "manual" };
  const per = meta.pieces ?? 1;
  const pieces = measure?.pieces ?? 0;
  if (pieces > per && pieces % per === 0 && meta.pieces) return { count: pieces / per, source: "pieces" };
  return { count: 1, source: "default" };
}

/** Sets (or clears, with null) how many finished objects one print of a file yields. */
export function setFileUnits(slug: string, rel: string, units: number | null) {
  if (!fs.existsSync(projectFile(slug, rel))) throw new HttpError(404, "Arquivo não encontrado");
  const { [rel]: _, ...rest } = readProjectMeta(slug).yields;
  updateProject(slug, { yields: units === null ? rest : { ...rest, [rel]: units } });
  return { ok: true };
}

/** Size and pieces of the finished object: what the user informed, else what was measured in the model. */
export type ObjectSize = {
  size: Dimensions | null;
  pieces: number | null;
  /** "manual" = informed by hand; "model" = measured in a single-piece file; null = unknown. */
  source: "manual" | "model" | null;
  /** The file that was measured, and how many pieces it has. */
  measured: { file: string; pieces: number; size: Dimensions | null } | null;
};

/** A ready-to-print version of a project (one 3MF per printer/material), as shown on the library card. */
export type Variant = {
  file: string;
  name: string;
  printer: string | null;
  process: string | null;
  /** Filaments actually used (type and colour). */
  filaments: { type: string; color: string }[];
  status: SliceState["status"] | null;
  units: number;
  grams: number | null;
  seconds: number | null;
  /** Per finished object. */
  total: number | null;
  price: number | null;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  categories: string[];
  sourceUrl: string;
  cover: Cover | null;
  /** Pictures the card can go through: the cover, the 3MF plates and the photos sent (see `projectPictures`). */
  pictures: number;
  files: { source: number; print: number };
  /** The first ready-to-print file: what this piece costs. */
  object: ObjectSize;
  /** Sale prices of the finished object per quantity (see ProjectMeta.salePrices). */
  salePrices: SalePrice[];
  /** Every ready-to-print file (printer/material versions), calculated or not. */
  variants: Variant[];
  /** `total` and `price` are per finished object; grams and seconds are for the whole print of `units` objects. */
  main: { file: string; units: number; grams: number; seconds: number; total: number; price: number; printer: string; colors: string[] } | null;
  calculating: boolean;
  updatedAt: string;
};

// ------------------------------------------------------------------------------------------------------- folders

const root = () => (fs.mkdirSync(LIBRARY_DIR, { recursive: true }), LIBRARY_DIR);

export function projectDir(slug: string): string {
  if (!slug || slug.includes("/") || slug.includes("..") || slug.startsWith(".")) throw new HttpError(400, "Projeto inválido");
  const dir = path.join(root(), slug);
  if (!fs.existsSync(path.join(dir, "projeto.json"))) throw new HttpError(404, `Projeto não encontrado: ${slug}`);
  return dir;
}

/** Absolute path of a file inside a project, refusing anything that escapes it. */
export function projectFile(slug: string, rel: string): string {
  const dir = projectDir(slug);
  const abs = path.resolve(dir, rel);
  if (!abs.startsWith(dir + path.sep)) throw new HttpError(400, "Caminho inválido");
  return abs;
}

export function readProjectMeta(slug: string): ProjectMeta {
  const file = path.join(projectDir(slug), "projeto.json");
  try { return projectMetaSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))); }
  catch { return projectMetaSchema.parse({ name: slug }); }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function createProject(name: string, patch: Partial<ProjectMeta> = {}): string {
  const base = slugify(name);
  if (!base) throw new HttpError(400, "Nome inválido");
  let slug = base;
  for (let i = 2; fs.existsSync(path.join(root(), slug)); i++) slug = `${base.slice(0, 56)}-${i}`;
  const dir = path.join(root(), slug);
  for (const sub of Object.values(FOLDERS)) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  writeJson(path.join(dir, "projeto.json"), projectMetaSchema.parse({ ...patch, name }));
  return slug;
}

export function updateProject(slug: string, patch: Partial<ProjectMeta>): ProjectMeta {
  const meta = projectMetaSchema.parse({ ...readProjectMeta(slug), ...patch });
  writeJson(path.join(projectDir(slug), "projeto.json"), meta);
  return meta;
}

/** Moves the whole project folder to the library trash (never deletes). */
export function archiveProject(slug: string) {
  const dir = projectDir(slug);
  const target = path.join(root(), TRASH, `${slug}-${Date.now()}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(dir, target);
  return { ok: true };
}

function freeName(dir: string, name: string) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let out = name;
  for (let i = 2; fs.existsSync(path.join(dir, out)); i++) out = `${base}-${i}${ext}`;
  return out;
}

/** What a 3MF says about itself (null for STL and unreadable files). Reads only its small Metadata entries. */
function infoOf(name: string, data: Uint8Array): ThreeMfInfo | null {
  if (!/\.3mf$/i.test(name)) return null;
  try { return inspect3mf(data); } catch { return null; }
}

/** A 3MF saved with printer settings goes to "fatiados" (ready to print); everything else to "origem". */
export function classify(name: string, data: Uint8Array): FolderKind {
  return infoOf(name, data)?.configured ? "print" : "source";
}

/** Saves files into a project, named by the library pattern (project name + printer). */
export function addProjectFiles(slug: string, files: { name: string; data: Uint8Array }[], folder?: FolderKind): string[] {
  const dir = projectDir(slug);
  const meta = readProjectMeta(slug);
  return files.map((f) => {
    if (!MODEL_EXT.test(f.name)) throw new HttpError(400, `Formato não suportado: ${f.name} (use STL ou 3MF)`);
    const info = infoOf(f.name, f.data);
    const target = path.join(dir, FOLDERS[folder ?? (info?.configured ? "print" : "source")]);
    fs.mkdirSync(target, { recursive: true });
    const name = freeName(target, `${standardFileBase(meta.name, info?.printer ?? null)}${path.extname(f.name).toLowerCase()}`);
    fs.writeFileSync(path.join(target, name), f.data);
    return path.posix.join(path.basename(target), name);
  });
}

/**
 * Moves/renames a file inside a project to `sub/name` (a free name), carrying along what is keyed by its path:
 * the cover, the manual yield and the cached slice statistics (so it is not sliced again).
 */
function relocate(slug: string, rel: string, sub: string, name: string): string {
  const abs = projectFile(slug, rel);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Arquivo não encontrado");
  const target = path.join(projectDir(slug), sub);
  fs.mkdirSync(target, { recursive: true });
  const free = path.join(target, name) === abs ? name : freeName(target, name);
  const next = path.posix.join(sub, free);
  if (next === rel) return rel;
  fs.renameSync(abs, path.join(target, free));
  try { fs.renameSync(cacheFile(slug, rel), cacheFile(slug, next)); } catch { /* not cached yet */ }
  const meta = readProjectMeta(slug);
  const { [rel]: units, ...yields } = meta.yields;
  updateProject(slug, {
    cover: isFileCover(meta.cover) && meta.cover.file === rel ? { ...meta.cover, file: next } : meta.cover,
    yields: units ? { ...yields, [next]: units } : yields,
    variations: meta.variations.map((v) => ({ ...v, files: v.files.map((f) => (f === rel ? next : f)) })),
  });
  return next;
}

export function moveProjectFile(slug: string, rel: string, folder: FolderKind): string {
  return relocate(slug, rel, FOLDERS[folder], path.posix.basename(rel));
}

/**
 * Renames every file that does not follow the library pattern (project name in camelCase + "_" + printer).
 * Returns what was renamed. Files open in the slicer keep saving under the old name until reopened.
 */
export function standardizeFileNames(slug: string): { from: string; to: string }[] {
  const meta = readProjectMeta(slug);
  return listFiles(slug, meta)
    .filter((f) => f.type !== "other" && !f.standardName)
    .map((f) => ({ from: f.rel, to: relocate(slug, f.rel, FOLDERS[f.folder], `${f.standardBase}${path.extname(f.name).toLowerCase()}`) }));
}

/** Sends a file to the project's trash folder (recoverable by hand). */
export function removeProjectFile(slug: string, rel: string) {
  const abs = projectFile(slug, rel);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Arquivo não encontrado");
  const trash = path.join(projectDir(slug), TRASH);
  fs.mkdirSync(trash, { recursive: true });
  fs.renameSync(abs, path.join(trash, freeName(trash, path.basename(abs))));
  const meta = readProjectMeta(slug);
  const { [rel]: _, ...yields } = meta.yields;
  updateProject(slug, {
    cover: isFileCover(meta.cover) && meta.cover.file === rel ? null : meta.cover,
    yields,
    variations: meta.variations.map((v) => ({ ...v, files: v.files.filter((f) => f !== rel) })),
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- file info cache

/** `measure` undefined = not measured yet (queued); null = could not be measured. */
type CacheEntry = { key: string; info: ThreeMfInfo | null; measure?: Measure | null; slice?: { stats: SliceStats; slicedAt: string } | { error: string } };

const fileKey = (st: fs.Stats) => `${st.size}:${Math.round(st.mtimeMs)}`;
const hash = (text: string) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
const cacheFile = (slug: string, rel: string) => path.join(projectDir(slug), CACHE, `${hash(rel)}.json`);
const modelKind = (rel: string) => (/\.3mf$/i.test(rel) ? "3mf" : /\.stl$/i.test(rel) ? "stl" : null);

function readCache(slug: string, rel: string, key: string): CacheEntry | null {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(slug, rel), "utf8")) as CacheEntry;
    return c.key === key ? c : null;
  } catch {
    return null;
  }
}

/**
 * What is known about a file, from the cache. A new version only gets its profiles read here (a few KB of the 3MF);
 * pieces and size are measured in the background queue, never inside a request.
 */
function fileInfo(slug: string, rel: string, abs: string, st: fs.Stats): CacheEntry {
  const key = fileKey(st);
  let entry = readCache(slug, rel, key);
  if (!entry) {
    let info: ThreeMfInfo | null = null;
    if (modelKind(rel) === "3mf") try { info = inspect3mf(abs); } catch { /* broken zip: shown as a plain file */ }
    entry = { key, info };
    writeJson(cacheFile(slug, rel), entry);
  }
  if (entry.measure === undefined && modelKind(rel)) enqueue({ slug, rel, key, task: "measure" });
  return entry;
}

/** Saves a result for the version of the file it was computed from (the file may have been saved again meanwhile). */
function saveResult(item: QueueItem, patch: Partial<CacheEntry>) {
  const abs = projectFile(item.slug, item.rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (fileKey(st) !== item.key) return;
  writeJson(cacheFile(item.slug, item.rel), { ...fileInfo(item.slug, item.rel, abs, st), ...patch });
}

// ------------------------------------------------------------------------------------------------- work queue

/**
 * One job at a time, for every project: measuring a model (reads its meshes) and slicing it (the slicer takes GBs
 * of memory and every core). Jobs are keyed by file version, so the same version is never measured/sliced twice.
 */
type QueueItem = { slug: string; rel: string; key: string; task: "measure" | "slice" };
const g = globalThis as unknown as { __libraryJobs?: { items: QueueItem[]; running: QueueItem | null; idle: (() => void)[] } };
const queue = (g.__libraryJobs ??= { items: [], running: null, idle: [] });
const same = (a: QueueItem | null, b: QueueItem) => !!a && a.slug === b.slug && a.rel === b.rel && a.key === b.key && a.task === b.task;

function enqueue(item: QueueItem) {
  if (same(queue.running, item) || queue.items.some((q) => same(q, item))) return;
  queue.items.push(item);
  void drain();
}

/** Resolves when the queue has nothing left to do (tests, scripts). */
export function whenIdle(): Promise<void> {
  if (!queue.running && !queue.items.length) return Promise.resolve();
  return new Promise((resolve) => queue.idle.push(resolve));
}

async function drain() {
  if (queue.running) return;
  const item = queue.items.shift();
  if (!item) {
    queue.idle.splice(0).forEach((resolve) => resolve());
    return;
  }
  queue.running = item;
  try {
    const abs = projectFile(item.slug, item.rel);
    if (fs.existsSync(abs) && fileKey(fs.statSync(abs)) === item.key) {
      if (item.task === "measure") {
        let measure: Measure | null = null;
        try { measure = await measureModelFile(abs, modelKind(item.rel)!); } catch { /* unreadable mesh: size stays unknown */ }
        saveResult(item, { measure });
      } else {
        let slice: CacheEntry["slice"];
        try {
          slice = { stats: await sliceFile(abs), slicedAt: new Date().toISOString() };
        } catch (e) {
          slice = { error: (e as Error).message };
        }
        saveResult(item, { slice });
      }
    }
  } catch (e) {
    console.error("[library]", item.task, item.rel, e);
  } finally {
    queue.running = null;
    setImmediate(() => void drain());
  }
}

function sliceState(slug: string, rel: string, entry: CacheEntry, meta: ProjectMeta): SliceState | null {
  if (!entry.info) return null;
  if (!entry.info.configured) return { status: "not-configured" };
  if (entry.slice && "stats" in entry.slice) {
    const s = entry.slice.stats;
    const cost = computeCost({
      grams: s.grams,
      types: s.filaments.map((f) => f.type),
      costPerKg: s.filaments.map((f) => f.costPerKg),
      seconds: s.seconds,
      printer: s.printer,
      extras: meta.extras,
      laborMinutes: meta.laborMinutes ?? undefined,
      units: fileUnits(meta, rel, entry.measure).count,
    }, getCostSettings());
    return { status: "done", stats: s, cost, slicedAt: entry.slice.slicedAt };
  }
  if (entry.slice) return { status: "failed", error: entry.slice.error };
  const job: QueueItem = { slug, rel, key: entry.key, task: "slice" };
  if (same(queue.running, job)) return { status: "running" };
  if (!findSlicer()) return { status: "no-slicer" };
  enqueue(job);
  return { status: "queued" };
}

/** Throws away the saved statistics of a file and slices it again. */
export function recalculate(slug: string, rel: string) {
  const abs = projectFile(slug, rel);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Arquivo não encontrado");
  const st = fs.statSync(abs);
  const entry = fileInfo(slug, rel, abs, st);
  delete entry.slice;
  writeJson(cacheFile(slug, rel), entry);
  return sliceState(slug, rel, entry, readProjectMeta(slug));
}

// --------------------------------------------------------------------------------------------------- variations

/** "15 cm base redonda" → size "15 cm", feature "Base redonda"; "Base quadrada" → feature only. */
export function splitVariationTitle(title: string): { size: string; feature: string } {
  const m = title.match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
  const size = m ? `${m[1]} ${m[2].toLowerCase()}` : "";
  const rest = (m ? title.replace(m[0], " ") : title).replace(/^[\s·\-–,/|]+|[\s·\-–,/|]+$/g, "").replace(/\s+/g, " ").trim();
  return { size, feature: rest ? rest[0].toUpperCase() + rest.slice(1) : "" };
}

function checkFiles(slug: string, files: string[]) {
  for (const f of files) if (!fs.existsSync(projectFile(slug, f))) throw new HttpError(400, `Arquivo não encontrado no projeto: ${f}`);
  return [...new Set(files)];
}

function findVariation(meta: ProjectMeta, id: string) {
  const v = meta.variations.find((x) => x.id === id);
  if (!v) throw new HttpError(404, `Variação não encontrada: ${id}`);
  return v;
}

/** Adds a variation (title + the file(s) that print it). Size and feature come from the title unless given. */
export function addVariation(slug: string, input: { title: string; files?: string[]; size?: string; feature?: string; salePrices?: SalePrice[] }): Variation {
  const meta = readProjectMeta(slug);
  const title = input.title.trim();
  if (!title) throw new HttpError(400, "Dê um nome para a variação");
  const base = slugify(title) || "variacao";
  let id = base;
  for (let i = 2; meta.variations.some((v) => v.id === id); i++) id = `${base}-${i}`;
  const split = splitVariationTitle(title);
  const variation = variationSchema.parse({
    id,
    title,
    size: input.size ?? split.size,
    feature: input.feature ?? split.feature,
    files: checkFiles(slug, input.files ?? []),
    // The first variation is usually the original product: it keeps the prices already set for it.
    salePrices: input.salePrices ?? (meta.variations.length ? [] : meta.salePrices),
  });
  updateProject(slug, { variations: [...meta.variations, variation] });
  return variation;
}

/** Changes a variation. A new title also refreshes size/feature that were derived from the old one. */
export function updateVariation(slug: string, id: string, patch: Partial<Omit<Variation, "id">>): Variation {
  const meta = readProjectMeta(slug);
  const old = findVariation(meta, id);
  const next = { ...old, ...patch };
  if (patch.title !== undefined) {
    const before = splitVariationTitle(old.title);
    const after = splitVariationTitle(patch.title);
    if (patch.size === undefined && old.size === before.size) next.size = after.size;
    if (patch.feature === undefined && old.feature === before.feature) next.feature = after.feature;
  }
  if (patch.files) next.files = checkFiles(slug, patch.files);
  const variation = variationSchema.parse(next);
  updateProject(slug, { variations: meta.variations.map((v) => (v.id === id ? variation : v)) });
  return variation;
}

export function removeVariation(slug: string, id: string) {
  const meta = readProjectMeta(slug);
  findVariation(meta, id);
  updateProject(slug, { variations: meta.variations.filter((v) => v.id !== id) });
  return { ok: true };
}

/** Cost of a variation on one printer: its parts added up (see combineCosts). */
export type VariationOption = {
  printer: string;
  files: string[];
  /** null while any part is not calculated yet. */
  cost: CostBreakdown | null;
  /** Filament per finished object, all parts. */
  grams: number | null;
  /** Printing time of all parts (whole prints). */
  seconds: number | null;
};

export type VariationView = Variation & {
  /** done = has a cost; calculating = slicing; waiting = a file is not ready (not configured, failed…); empty = no file. */
  status: "done" | "calculating" | "waiting" | "empty";
  /** One per printer the files are set up for; the first is the main one. */
  options: VariationOption[];
  /** The main option's cost per finished object (normal colour). */
  cost: CostBreakdown | null;
  grams: number | null;
  seconds: number | null;
  /** Size measured in the model when the variation is a single one-piece file. */
  measured: Dimensions | null;
  /** Cost and suggested price in each colour that has its own filament price. */
  colors: { name: string; perKg: number; surcharge: number; total: number; price: number }[];
};

const printerName = (f: LibraryFile) =>
  (f.slice?.status === "done" ? f.slice.cost.printer : f.info?.printer?.replace(/\s*\d+(\.\d+)?\s*nozzle$/i, "")) || "Outra impressora";

export function variationViews(meta: ProjectMeta, files: LibraryFile[], s: CostSettings = getCostSettings()): VariationView[] {
  const byRel = new Map(files.map((f) => [f.rel, f]));
  return meta.variations.map((v) => {
    const own = v.files.map((rel) => byRel.get(rel)).filter((f): f is LibraryFile => !!f);
    const groups = new Map<string, LibraryFile[]>();
    for (const f of own) groups.set(printerName(f), [...(groups.get(printerName(f)) ?? []), f]);
    const options = [...groups].map(([printer, parts]): VariationOption => {
      const done = parts.map((f) => (f.slice?.status === "done" ? f.slice : null));
      if (done.some((d) => !d)) return { printer, files: parts.map((f) => f.rel), cost: null, grams: null, seconds: null };
      const slices = done as Extract<SliceState, { status: "done" }>[];
      return {
        printer,
        files: parts.map((f) => f.rel),
        cost: combineCosts(slices.map((d) => d.cost), s),
        grams: Math.round(slices.reduce((n, d) => n + d.stats.grams.reduce((a, b) => a + b, 0) / d.cost.units, 0) * 10) / 10,
        seconds: slices.reduce((n, d) => n + d.stats.seconds, 0),
      };
    });
    const main = options.find((o) => o.cost) ?? null;
    const status: VariationView["status"] = !own.length ? "empty"
      : main ? "done"
      : own.some((f) => f.slice?.status === "queued" || f.slice?.status === "running") ? "calculating"
      : "waiting";
    const parts = main ? main.files.map((rel) => byRel.get(rel)!.slice as Extract<SliceState, { status: "done" }>) : [];
    const colors = main
      ? meta.colors.flatMap((c) => {
          if (c.perKg === null) return [];
          const surcharge = Math.round(parts.reduce((n, d) => n + colorSurcharge(d.stats.grams.map((g) => g / d.cost.units), d.cost.filamentPerKg, c.perKg!, s), 0) * 100) / 100;
          const cost = combineCosts(parts.map((d) => d.cost), s, surcharge);
          return [{ name: c.name, perKg: c.perKg, surcharge, total: cost.total, price: cost.price }];
        })
      : [];
    const single = own.length === 1 && own[0].measure?.pieces === 1 ? own[0].measure.size : null;
    return { ...v, status, options, cost: main?.cost ?? null, grams: main?.grams ?? null, seconds: main?.seconds ?? null, measured: single, colors };
  });
}

/** A project without variations seen as one variation of its first ready file (for colour prices). */
function singleView(meta: ProjectMeta, files: LibraryFile[]): VariationView | null {
  const first = files.find((f) => f.folder === "print" && f.info?.configured);
  if (meta.variations.length || !first) return null;
  return variationViews({ ...meta, variations: [variationSchema.parse({ id: "unico", title: meta.name, files: [first.rel] })] }, files)[0];
}

// ------------------------------------------------------------------------------------------------------ reading

function listFiles(slug: string, meta: ProjectMeta): LibraryFile[] {
  const dir = projectDir(slug);
  return (Object.entries(FOLDERS) as [FolderKind, string][]).flatMap(([folder, sub]) => {
    const abs = path.join(dir, sub);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map((e) => {
        const rel = path.posix.join(sub, e.name);
        const file = path.join(abs, e.name);
        const st = fs.statSync(file);
        const entry = fileInfo(slug, rel, file, st);
        const ext = path.extname(e.name).toLowerCase();
        const standardBase = standardFileBase(meta.name, entry.info?.configured ? entry.info.printer : null);
        return {
          rel,
          name: e.name,
          folder,
          type: ext === ".3mf" ? "3mf" : ext === ".stl" ? "stl" : "other",
          size: st.size,
          modifiedAt: st.mtime.toISOString(),
          info: entry.info,
          slice: sliceState(slug, rel, entry, meta),
          measure: entry.measure ?? null,
          measuring: entry.measure === undefined && !!modelKind(rel),
          units: fileUnits(meta, rel, entry.measure),
          standardBase,
          standardName: followsStandard(e.name, standardBase),
        } satisfies LibraryFile;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });
}

/** The picture of a project: the chosen cover (if it still exists), else the first plate of a ready file, else any model. */
function coverOf(meta: ProjectMeta, files: LibraryFile[]): Cover | null {
  const c = meta.cover;
  if (isFileCover(c) ? files.some((f) => f.rel === c.file) : c && studioImageFile(meta, c.image)) return c;
  return defaultCover(files);
}

/** The cover when nothing (valid) was chosen: the first plate with a picture of a ready file, else any model. */
function defaultCover(files: LibraryFile[]): FileCover | null {
  const pick = files.find((f) => f.folder === "print" && f.info?.plates.some((p) => p.thumb)) ?? files.find((f) => f.type !== "other");
  return pick ? { file: pick.rel, plate: pick.info?.plates.find((p) => p.thumb)?.plate ?? 1 } : null;
}

/** The object's size: informed by hand, else measured in the cover file, a ready file or any model (first single-piece one). */
function objectSize(meta: ProjectMeta, files: LibraryFile[], cover: Cover | null): ObjectSize {
  const order = [...files.filter((f) => isFileCover(cover) && f.rel === cover.file), ...files.filter((f) => f.folder === "print"), ...files].filter((f) => f.measure);
  const pick = order.find((f) => f.measure!.size) ?? order[0];
  const measured = pick ? { file: pick.rel, pieces: pick.measure!.pieces, size: pick.measure!.size } : null;
  // A file with several pieces may hold several copies of the object, so only a single piece says "1 peça" by itself.
  const pieces = meta.pieces ?? (measured?.pieces === 1 ? 1 : null);
  if (meta.size) return { size: meta.size, pieces, source: "manual", measured };
  return { size: measured?.size ?? null, pieces, source: measured?.size ? "model" : null, measured };
}

export function getProject(slug: string) {
  const meta = readProjectMeta(slug);
  const files = listFiles(slug, meta);
  const cover = coverOf(meta, files);
  /** `coverChosen`: the cover was picked by hand (and still exists); otherwise it is the default plate. */
  return { slug, ...meta, cover, coverChosen: !!meta.cover && cover === meta.cover, files, object: objectSize(meta, files, cover), variations: variationViews(meta, files), single: singleView(meta, files), folder: projectDir(slug) };
}
export type Project = ReturnType<typeof getProject>;

export function listProjects(): ProjectSummary[] {
  const dirs = fs.readdirSync(root(), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".") && fs.existsSync(path.join(root(), d.name, "projeto.json")));
  return dirs
    .map((d) => {
      const slug = d.name;
      const meta = readProjectMeta(slug);
      const files = listFiles(slug, meta);
      const ready = files.find((f) => f.folder === "print" && f.slice?.status === "done");
      const done = ready?.slice?.status === "done" ? ready.slice : null;
      const updated = Math.max(fs.statSync(path.join(root(), slug, "projeto.json")).mtimeMs, ...files.map((f) => Date.parse(f.modifiedAt)));
      return {
        slug,
        name: meta.name,
        categories: meta.categories,
        sourceUrl: meta.sourceUrl,
        cover: coverOf(meta, files),
        pictures: pictureCount(meta, files),
        object: objectSize(meta, files, coverOf(meta, files)),
        salePrices: meta.salePrices,
        variants: files.filter((f) => f.folder === "print").map((f): Variant => {
          const d = f.slice?.status === "done" ? f.slice : null;
          const filaments = d
            ? d.stats.filaments.filter((_, i) => (d.stats.grams[i] ?? 0) > 0)
            : (f.info?.filaments ?? []);
          return {
            file: f.rel,
            name: f.name.replace(/\.(3mf|stl)$/i, ""),
            printer: d?.cost.printer ?? f.info?.printer?.replace(/\s*\d+(\.\d+)?\s*nozzle$/i, "") ?? null,
            process: f.info?.process ?? null,
            filaments: [...new Map(filaments.map((x) => [`${x.type}${x.color}`, { type: x.type, color: x.color }])).values()],
            status: f.slice?.status ?? null,
            units: d?.cost.units ?? f.units.count,
            grams: d ? d.stats.grams.reduce((a, b) => a + b, 0) : null,
            seconds: d?.stats.seconds ?? null,
            total: d?.cost.total ?? null,
            price: d?.cost.price ?? null,
          };
        }),
        files: { source: files.filter((f) => f.folder === "source").length, print: files.filter((f) => f.folder === "print").length },
        main: ready && done
          ? {
              file: ready.rel,
              units: done.cost.units,
              grams: done.stats.grams.reduce((a, b) => a + b, 0),
              seconds: done.stats.seconds,
              total: done.cost.total,
              price: done.cost.price,
              printer: done.cost.printer,
              colors: done.stats.filaments.filter((_, i) => (done.stats.grams[i] ?? 0) > 0).map((f) => f.color),
            }
          : null,
        calculating: files.some((f) => f.measuring || f.slice?.status === "queued" || f.slice?.status === "running"),
        updatedAt: new Date(updated).toISOString(),
      } satisfies ProjectSummary;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function allCategories(): string[] {
  const used = listProjectsMetaOnly().flatMap((m) => m.categories);
  return [...new Set([...DEFAULT_CATEGORIES, ...used])].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function listProjectsMetaOnly(): ProjectMeta[] {
  return fs
    .readdirSync(root(), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && fs.existsSync(path.join(root(), d.name, "projeto.json")))
    .map((d) => readProjectMeta(d.name));
}

// -------------------------------------------------------------------------------------------------------- pictures

const g2 = globalThis as unknown as { __libraryPictures?: { making: Map<string, Promise<Buffer>>; renders: Promise<unknown> } };
const pictures = (g2.__libraryPictures ??= { making: new Map(), renders: Promise.resolve() });

/** Runs `fn` once per key at a time: requests for the same picture share the work. */
function once(key: string, fn: () => Promise<Buffer>): Promise<Buffer> {
  const running = pictures.making.get(key);
  if (running) return running;
  const p = fn().finally(() => pictures.making.delete(key));
  pictures.making.set(key, p);
  return p;
}

/** Renders one model at a time (reading a big mesh takes hundreds of MB while it lasts). */
function oneRenderAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const p = pictures.renders.then(fn, fn);
  pictures.renders = p.catch(() => {});
  return p;
}

/**
 * PNG of a plate (the slicer's own picture, read alone from the 3MF) or a quick render of the model, `width` pixels
 * wide (0 = as is). Made once per file version, plate and width and kept in .studio/pictures; older versions of the
 * same file are removed when a new one is made.
 */
export async function filePicture(slug: string, rel: string, plate = 1, width = 0): Promise<Buffer> {
  const abs = projectFile(slug, rel);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Arquivo não encontrado");
  const entry = fileInfo(slug, rel, abs, fs.statSync(abs));
  const w = Math.max(0, Math.min(1600, Math.round(width) || 0));
  const dir = path.join(projectDir(slug), CACHE, "pictures");
  const [file, version] = [hash(rel), hash(entry.key)];
  const target = path.join(dir, `${file}-${version}-${plate}-${w}.png`);
  if (fs.existsSync(target)) return fs.readFileSync(target);

  return once(target, async () => {
    const thumb = entry.info?.plates.find((p) => p.plate === plate)?.thumb ?? entry.info?.plates.find((p) => p.thumb)?.thumb;
    let png = thumb ? plateImage(abs, thumb) : null;
    if (!png) {
      const rendered = path.join(dir, `${file}-${version}-render.png`);
      png = fs.existsSync(rendered) ? fs.readFileSync(rendered) : await once(rendered, () => oneRenderAtATime(async () => {
        const kind = modelKind(rel);
        const meshes = kind ? await modelMeshesFile(abs, kind) : [];
        if (!meshes.some((m) => m.soup.length)) throw new HttpError(404, "Sem imagem para este arquivo");
        const color = entry.info?.filaments[0]?.color ?? "#8fb39a";
        const out = await renderPreview(meshes, /^#[0-9a-f]{6}$/i.test(color) ? color : "#8fb39a");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(rendered, out);
        return out;
      }));
    }
    if (w) png = await sharp(png).resize({ width: w, withoutEnlargement: true }).png().toBuffer();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, png);
    for (const old of fs.readdirSync(dir)) if (old.startsWith(`${file}-`) && !old.startsWith(`${file}-${version}-`)) fs.rmSync(path.join(dir, old), { force: true });
    return png;
  });
}

/**
 * A picture of the linked studio product (`real/x.jpg`, `approved/y.png`), or null when there is no linked product,
 * the path is outside the photo/approved folders or the file is gone.
 */
function studioImageFile(meta: ProjectMeta, image: string): string | null {
  if (!meta.product || !IMAGE_EXT.test(image) || !COVER_IMAGE_DIRS.some((d) => image.startsWith(`${d}/`)) || !locateProduct(meta.product)) return null;
  try {
    const abs = productFile(meta.product, image);
    return fs.existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

/** Absolute path of a studio picture of a project (for the picture endpoint). */
export function projectImageFile(slug: string, image: string): string {
  const abs = studioImageFile(readProjectMeta(slug), image);
  if (!abs) throw new HttpError(404, "Imagem não encontrada");
  return abs;
}

/** Image files of one folder of the linked studio product, as paths inside the product (`real/foto.jpg`). */
function studioImages(meta: ProjectMeta, sub: (typeof COVER_IMAGE_DIRS)[number]): string[] {
  const found = meta.product ? locateProduct(meta.product) : null;
  if (!found) return [];
  try {
    return fs
      .readdirSync(path.join(found.dir, sub), { withFileTypes: true })
      .filter((e) => e.isFile() && IMAGE_EXT.test(e.name))
      .map((e) => path.posix.join(sub, e.name))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch {
    return [];
  }
}

/** One picture a project can show (and use as its cover). */
export type ProjectPicture =
  | { source: "file"; file: string; plate: number; label: string; version: string; cover: boolean }
  | { source: "photo" | "generated"; image: string; label: string; version: string; cover: boolean };

const sameCover = (a: Cover | null, p: ProjectPicture) =>
  !!a && (isFileCover(a) ? p.source === "file" && p.file === a.file && p.plate === a.plate : p.source !== "file" && p.image === a.image);

function fileFrames(files: LibraryFile[], all: boolean): ProjectPicture[] {
  const ordered = [...files.filter((f) => f.folder === "print"), ...files.filter((f) => f.folder !== "print")];
  // The file name only matters when there is more than one file to tell apart.
  const named = ordered.filter((f) => f.type !== "other").length > 1;
  return ordered.flatMap((f): ProjectPicture[] => {
    const plates = f.info?.plates.filter((p) => p.thumb) ?? [];
    const base = { source: "file" as const, file: f.rel, version: f.modifiedAt, cover: false };
    const label = (p: { plate: number; name: string | null }) => [named && f.name, `Mesa ${p.plate}`, p.name].filter(Boolean).join(" · ");
    if (plates.length) return plates.map((p) => ({ ...base, plate: p.plate, label: label(p) }));
    // Files without a slicer picture need a 3D render: only where it is worth the wait (the project page).
    return all && f.type !== "other" ? [{ ...base, plate: 1, label: f.name }] : [];
  });
}

/**
 * Every picture of a project, the cover first: the plates of its print files, the photos sent to its studio product
 * and — with `generated` — the images approved in the studio. Without `all`, only the cheap ones (plates with a slicer
 * picture and photos), as the library card shows; an image from the studio still shows when it is the cover.
 */
export function projectPictures(slug: string, { all = true }: { all?: boolean } = {}): { cover: Cover | null; pictures: ProjectPicture[] } {
  const meta = readProjectMeta(slug);
  const files = listFiles(slug, meta);
  const cover = coverOf(meta, files);
  const stamp = (image: string) => {
    try { return String(Math.round(fs.statSync(studioImageFile(meta, image)!).mtimeMs)); } catch { return ""; }
  };
  const studio = (sub: (typeof COVER_IMAGE_DIRS)[number], source: "photo" | "generated", label: string) =>
    studioImages(meta, sub).map((image, i): ProjectPicture => ({ source, image, label: `${label} ${i + 1}`, version: stamp(image), cover: false }));
  const generated = studio(SUBDIRS.approved, "generated", "Imagem do estúdio");
  const pictures = [
    ...fileFrames(files, all),
    ...studio(SUBDIRS.real, "photo", "Foto"),
    ...(all ? generated : generated.filter((p) => sameCover(cover, p))),
  ];
  const first = pictures.findIndex((p) => sameCover(cover, p));
  // A chosen render of a file without slicer pictures is not in the cheap list: keep it first anyway.
  const lead: ProjectPicture[] = first >= 0 ? pictures.splice(first, 1) : isFileCover(cover) ? fileFrames(files.filter((f) => f.rel === cover.file), true).slice(0, 1) : [];
  return { cover, pictures: [...lead.map((p) => ({ ...p, cover: true })), ...pictures] };
}

/** How many pictures the library card can go through (same as `projectPictures(slug, { all: false })`, cheaper). */
function pictureCount(meta: ProjectMeta, files: LibraryFile[]): number {
  const cover = coverOf(meta, files);
  const plates = files.reduce((n, f) => n + (f.info?.plates.filter((p) => p.thumb).length ?? 0), 0);
  const coverInPlates = isFileCover(cover) && files.some((f) => f.rel === cover.file && f.info?.plates.some((p) => p.plate === cover.plate && p.thumb));
  const generatedCover = !!cover && !isFileCover(cover) && cover.image.startsWith(`${SUBDIRS.approved}/`);
  return plates + studioImages(meta, SUBDIRS.real).length + (generatedCover || (isFileCover(cover) && !coverInPlates) ? 1 : 0);
}

/** Chooses the cover of a project (null = back to the default: the first plate of a ready file). */
export function setProjectCover(slug: string, cover: Cover | null): Cover | null {
  const meta = readProjectMeta(slug);
  if (isFileCover(cover) && !fs.existsSync(projectFile(slug, cover.file))) throw new HttpError(404, "Arquivo não encontrado");
  if (cover && !isFileCover(cover) && !studioImageFile(meta, cover.image)) throw new HttpError(404, "Imagem não encontrada no estúdio deste projeto");
  updateProject(slug, { cover });
  return coverOf(readProjectMeta(slug), listFiles(slug, readProjectMeta(slug)));
}

// ------------------------------------------------------------------------------------------------------- actions

export async function printFile(slug: string, rel: string) {
  const abs = projectFile(slug, rel);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Arquivo não encontrado");
  return openInSlicer(abs);
}

// ---------------------------------------------------------------------------------------------- downloads inbox

const importedFile = () => path.join(DATA_DIR, "downloads-imported.json");
const inboxKey = (name: string, st: fs.Stats) => `${name}|${st.size}|${Math.round(st.mtimeMs)}`;
function imported(): Set<string> {
  try { return new Set(JSON.parse(fs.readFileSync(importedFile(), "utf8"))); } catch { return new Set(); }
}
function markImported(keys: string[]) {
  const all = imported();
  keys.forEach((k) => all.add(k));
  writeJson(importedFile(), [...all].slice(-2000));
}

export type InboxFile = { name: string; size: number; modifiedAt: string };

/** STL/3MF files in the Downloads folder that were not imported or dismissed yet, newest first. */
export function listInbox(limit = 40): InboxFile[] {
  if (!fs.existsSync(DOWNLOADS_DIR)) return [];
  const done = imported();
  return fs
    .readdirSync(DOWNLOADS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && MODEL_EXT.test(e.name))
    .map((e) => ({ name: e.name, st: fs.statSync(path.join(DOWNLOADS_DIR, e.name)) }))
    .filter(({ name, st }) => !done.has(inboxKey(name, st)))
    .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
    .slice(0, limit)
    .map(({ name, st }) => ({ name, size: st.size, modifiedAt: st.mtime.toISOString() }));
}

function inboxPath(name: string) {
  const abs = path.resolve(DOWNLOADS_DIR, name);
  if (path.dirname(abs) !== DOWNLOADS_DIR || !fs.existsSync(abs)) throw new HttpError(404, `Arquivo não encontrado em Downloads: ${name}`);
  return abs;
}

/**
 * Copies files from Downloads into a project (a new one named after the first file when `slug` is empty).
 * The originals stay in Downloads; they just stop showing in the inbox.
 */
export function importFromInbox(names: string[], target: { slug?: string; name?: string } = {}) {
  if (!names.length) throw new HttpError(400, "Escolha ao menos um arquivo");
  const sources = names.map((n) => ({ name: n, abs: inboxPath(n) }));
  const slug = target.slug || createProject(target.name?.trim() || path.basename(names[0], path.extname(names[0])).replace(/[-_+]+/g, " ").trim());
  const saved = addProjectFiles(slug, sources.map((s) => ({ name: s.name, data: fs.readFileSync(s.abs) })));
  markImported(sources.map((s) => inboxKey(s.name, fs.statSync(s.abs))));
  return { slug, saved };
}

export function dismissInbox(names: string[]) {
  markImported(names.map((n) => inboxKey(n, fs.statSync(inboxPath(n)))));
  return { ok: true };
}
