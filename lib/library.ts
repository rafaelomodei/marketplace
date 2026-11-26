import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { computeCost, extraSchema, getCostSettings, type CostBreakdown } from "./costing";
import { DATA_DIR, DOWNLOADS_DIR, LIBRARY_DIR } from "./paths";
import { type Dimensions, inspect3mf, type Measure, measureModel, MODEL_EXT, plateImage, renderPreview, stlTriangles, threeMfTriangles, type ThreeMfInfo } from "./print-files";
import { HttpError } from "./products";
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

export const projectMetaSchema = z.object({
  name: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).default([]),
  sourceUrl: z.string().trim().default(""),
  notes: z.string().default(""),
  cover: z.object({ file: z.string(), plate: z.number().int().positive().default(1) }).nullable().default(null),
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
    z.array(salePriceSchema).default([]),
  ).transform((tiers) => [...new Map(tiers.map((t) => [t.quantity, t])).values()].sort((a, b) => a.quantity - b.quantity)),
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
  cover: { file: string; plate: number } | null;
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

/** A 3MF saved with printer settings goes to "fatiados" (ready to print); everything else to "origem". */
export function classify(name: string, data: Uint8Array): FolderKind {
  if (!/\.3mf$/i.test(name)) return "source";
  try { return inspect3mf(data).configured ? "print" : "source"; } catch { return "source"; }
}

/** The printer saved in a 3MF (null for STL, unconfigured or unreadable files). */
function printerOf(name: string, data: Uint8Array): string | null {
  if (!/\.3mf$/i.test(name)) return null;
  try { return inspect3mf(data).printer; } catch { return null; }
}

/** Saves files into a project, named by the library pattern (project name + printer). */
export function addProjectFiles(slug: string, files: { name: string; data: Uint8Array }[], folder?: FolderKind): string[] {
  const dir = projectDir(slug);
  const meta = readProjectMeta(slug);
  return files.map((f) => {
    if (!MODEL_EXT.test(f.name)) throw new HttpError(400, `Formato não suportado: ${f.name} (use STL ou 3MF)`);
    const target = path.join(dir, FOLDERS[folder ?? classify(f.name, f.data)]);
    fs.mkdirSync(target, { recursive: true });
    const name = freeName(target, `${standardFileBase(meta.name, printerOf(f.name, f.data))}${path.extname(f.name).toLowerCase()}`);
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
    cover: meta.cover?.file === rel ? { ...meta.cover, file: next } : meta.cover,
    yields: units ? { ...yields, [next]: units } : yields,
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
  updateProject(slug, { cover: meta.cover?.file === rel ? null : meta.cover, yields });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- file info cache

type CacheEntry = { key: string; info: ThreeMfInfo | null; measure?: Measure | null; slice?: { stats: SliceStats; slicedAt: string } | { error: string } };

const fileKey = (st: fs.Stats) => `${st.size}:${Math.round(st.mtimeMs)}`;
const cacheFile = (slug: string, rel: string) => path.join(projectDir(slug), CACHE, `${crypto.createHash("sha1").update(rel).digest("hex").slice(0, 16)}.json`);

function readCache(slug: string, rel: string, key: string): CacheEntry | null {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(slug, rel), "utf8")) as CacheEntry;
    return c.key === key ? c : null;
  } catch {
    return null;
  }
}

function fileInfo(slug: string, rel: string, abs: string, st: fs.Stats): CacheEntry {
  const key = fileKey(st);
  const cached = readCache(slug, rel, key);
  if (cached && cached.measure !== undefined) return cached;
  const kind = /\.3mf$/i.test(rel) ? "3mf" : /\.stl$/i.test(rel) ? "stl" : null;
  const data = kind ? fs.readFileSync(abs) : null;
  let info: ThreeMfInfo | null = cached?.info ?? null;
  if (kind === "3mf" && !cached) try { info = inspect3mf(data!); } catch { /* broken zip: shown as a plain file */ }
  let measure: Measure | null = null;
  if (kind) try { measure = measureModel(data!, kind); } catch { /* unreadable mesh: size stays unknown */ }
  const entry: CacheEntry = { ...cached, key, info, measure };
  writeJson(cacheFile(slug, rel), entry);
  return entry;
}

// ------------------------------------------------------------------------------------------------- slicing queue

type QueueItem = { slug: string; rel: string; key: string };
const g = globalThis as unknown as { __libraryQueue?: { items: QueueItem[]; running: QueueItem | null } };
const queue = (g.__libraryQueue ??= { items: [], running: null });
const same = (a: QueueItem | null, slug: string, rel: string, key: string) => !!a && a.slug === slug && a.rel === rel && a.key === key;

function enqueue(item: QueueItem) {
  if (same(queue.running, item.slug, item.rel, item.key) || queue.items.some((q) => same(q, item.slug, item.rel, item.key))) return;
  queue.items.push(item);
  void drain();
}

async function drain() {
  if (queue.running) return;
  const item = queue.items.shift();
  if (!item) return;
  queue.running = item;
  try {
    const abs = projectFile(item.slug, item.rel);
    const st = fs.statSync(abs);
    if (fileKey(st) === item.key) {
      const entry = fileInfo(item.slug, item.rel, abs, st);
      try {
        entry.slice = { stats: await sliceFile(abs), slicedAt: new Date().toISOString() };
      } catch (e) {
        entry.slice = { error: (e as Error).message };
      }
      // The file may have been saved again while slicing: only keep results for the version that was sliced.
      if (fs.existsSync(abs) && fileKey(fs.statSync(abs)) === item.key) writeJson(cacheFile(item.slug, item.rel), entry);
    }
  } catch (e) {
    console.error("[library] slice", item.rel, e);
  } finally {
    queue.running = null;
    void drain();
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
  if (same(queue.running, slug, rel, entry.key)) return { status: "running" };
  if (!findSlicer()) return { status: "no-slicer" };
  enqueue({ slug, rel, key: entry.key });
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
          units: fileUnits(meta, rel, entry.measure),
          standardBase,
          standardName: followsStandard(e.name, standardBase),
        } satisfies LibraryFile;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });
}

/** The picture of a project: the chosen cover, else the first plate of a ready file, else any model. */
function coverOf(meta: ProjectMeta, files: LibraryFile[]) {
  if (meta.cover && files.some((f) => f.rel === meta.cover!.file)) return meta.cover;
  const pick = files.find((f) => f.folder === "print" && f.info?.plates.some((p) => p.thumb)) ?? files.find((f) => f.type !== "other");
  return pick ? { file: pick.rel, plate: pick.info?.plates.find((p) => p.thumb)?.plate ?? 1 } : null;
}

/** The object's size: informed by hand, else measured in the cover file, a ready file or any model (first single-piece one). */
function objectSize(meta: ProjectMeta, files: LibraryFile[], cover: { file: string } | null): ObjectSize {
  const order = [...files.filter((f) => f.rel === cover?.file), ...files.filter((f) => f.folder === "print"), ...files].filter((f) => f.measure);
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
  return { slug, ...meta, cover, files, object: objectSize(meta, files, cover), folder: projectDir(slug) };
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
        calculating: files.some((f) => f.slice?.status === "queued" || f.slice?.status === "running"),
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

/** PNG of a plate (the slicer's own picture) or a quick render of the model. Cached next to the file info. */
export async function filePicture(slug: string, rel: string, plate = 1): Promise<Buffer> {
  const abs = projectFile(slug, rel);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Arquivo não encontrado");
  const st = fs.statSync(abs);
  const entry = fileInfo(slug, rel, abs, st);
  const thumb = entry.info?.plates.find((p) => p.plate === plate)?.thumb ?? entry.info?.plates.find((p) => p.thumb)?.thumb;
  if (thumb) {
    const png = plateImage(fs.readFileSync(abs), thumb);
    if (png) return png;
  }
  const cached = path.join(projectDir(slug), CACHE, `${crypto.createHash("sha1").update(`${rel}:${entry.key}`).digest("hex").slice(0, 16)}.png`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const data = fs.readFileSync(abs);
  const soup = /\.stl$/i.test(rel) ? stlTriangles(data) : /\.3mf$/i.test(rel) ? threeMfTriangles(data) : new Float32Array();
  if (!soup.length) throw new HttpError(404, "Sem imagem para este arquivo");
  const color = entry.info?.filaments[0]?.color ?? "#8fb39a";
  const png = await renderPreview(soup, /^#[0-9a-f]{6}$/i.test(color) ? color : "#8fb39a");
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, png);
  return png;
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
