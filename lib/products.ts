import fs from "node:fs";
import path from "node:path";
import { db, now, type ImageRow, type JobRow } from "./db";
import { IMAGE_EXT, PRODUCTS_DIR, STAGES, SUBDIRS, type ImageKind, type Stage } from "./paths";

export type ProductMeta = {
  name: string;
  description: string;
  fidelityNotes: string;
  marketplaces: string[];
};

export type ProductSummary = {
  slug: string;
  stage: Stage;
  name: string;
  cover: string | null;
  counts: Record<ImageKind, number> & { pendingReview: number };
  activeJobs: number;
};

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function safeFileName(name: string): string {
  const ext = path.extname(name);
  const base = slugify(path.basename(name, ext)) || "imagem";
  return `${base}${ext.toLowerCase()}`;
}

function stageDir(stage: Stage) {
  return path.join(PRODUCTS_DIR, stage);
}

/** Finds the folder of a product by looking in every stage (the filesystem is the source of truth). */
export function locateProduct(slug: string): { stage: Stage; dir: string } | null {
  if (!slug || slug.includes("/") || slug.includes("..")) return null;
  for (const stage of STAGES) {
    const dir = path.join(stageDir(stage), slug);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return { stage, dir };
  }
  return null;
}

export function requireProduct(slug: string) {
  const found = locateProduct(slug);
  if (!found) throw new HttpError(404, `Produto não encontrado: ${slug}`);
  return found;
}

/** Resolves a path relative to a product folder, refusing anything that escapes it. */
export function productFile(slug: string, rel: string): string {
  const { dir } = requireProduct(slug);
  const abs = path.resolve(dir, rel);
  if (!abs.startsWith(dir + path.sep)) throw new HttpError(400, "Caminho inválido");
  return abs;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function readMeta(slug: string): ProductMeta {
  const { dir } = requireProduct(slug);
  const file = path.join(dir, "product.json");
  const fallback: ProductMeta = { name: slug, description: "", fidelityNotes: "", marketplaces: ["shopee"] };
  if (!fs.existsSync(file)) return fallback;
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return fallback;
  }
}

export function writeMeta(slug: string, patch: Partial<ProductMeta>): ProductMeta {
  const { dir } = requireProduct(slug);
  const meta = { ...readMeta(slug), ...patch };
  fs.writeFileSync(path.join(dir, "product.json"), JSON.stringify(meta, null, 2) + "\n");
  db().prepare("UPDATE products SET name = ?, updated_at = ? WHERE slug = ?").run(meta.name, now(), slug);
  return meta;
}

export function createProduct(name: string, meta: Partial<ProductMeta> = {}): string {
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, "Nome inválido");
  if (locateProduct(slug)) throw new HttpError(409, `Já existe um produto "${slug}"`);
  const dir = path.join(stageDir("create"), slug);
  for (const sub of [SUBDIRS.real, SUBDIRS.style]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "product.json"),
    JSON.stringify({ name, description: "", fidelityNotes: "", marketplaces: ["shopee"], ...meta }, null, 2) + "\n",
  );
  syncProduct(slug);
  return slug;
}

function walkImages(dir: string, relBase: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(relBase, entry.name);
    if (entry.isDirectory()) out.push(...walkImages(path.join(dir, entry.name), rel));
    else if (IMAGE_EXT.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Brings the DB in line with what is on disk for one product. */
export function syncProduct(slug: string) {
  const found = locateProduct(slug);
  const d = db();
  if (!found) {
    d.prepare("DELETE FROM products WHERE slug = ?").run(slug);
    return;
  }
  const meta = readMeta(slug);
  d.prepare(
    `INSERT INTO products (slug, stage, name, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET stage = excluded.stage, name = excluded.name`,
  ).run(slug, found.stage, meta.name, now());

  const onDisk = new Set<string>();
  const insert = d.prepare(
    `INSERT OR IGNORE INTO images (product, rel, kind, status, job_id, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
  );
  for (const [kind, sub] of Object.entries(SUBDIRS)) {
    for (const rel of walkImages(path.join(found.dir, sub), sub)) {
      onDisk.add(rel);
      const jobId = kind === "generated" ? path.basename(rel, path.extname(rel)) : null;
      insert.run(slug, rel, kind, jobId, now());
    }
  }
  const rows = d.prepare("SELECT id, rel, kind, parent_id FROM images WHERE product = ?").all(slug) as ImageRow[];
  for (const row of rows) {
    if (onDisk.has(row.rel)) continue;
    d.prepare("DELETE FROM images WHERE id = ?").run(row.id);
    // An approved copy removed by hand un-approves its source candidate.
    if (row.kind === "approved" && row.parent_id)
      d.prepare("UPDATE images SET status = 'pending' WHERE id = ? AND status = 'approved'").run(row.parent_id);
  }
}

export function syncAll() {
  const slugs = new Set<string>();
  for (const stage of STAGES) {
    const dir = stageDir(stage);
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
      if (entry.isDirectory() && !entry.name.startsWith(".")) slugs.add(entry.name);
  }
  const known = (db().prepare("SELECT slug FROM products").all() as { slug: string }[]).map((r) => r.slug);
  for (const slug of new Set([...slugs, ...known])) syncProduct(slug);
}

export function listProducts(): ProductSummary[] {
  syncAll();
  const d = db();
  const products = d.prepare("SELECT slug, stage, name FROM products ORDER BY name").all() as {
    slug: string;
    stage: Stage;
    name: string;
  }[];
  return products.map((p) => {
    const images = d.prepare("SELECT kind, status, rel FROM images WHERE product = ?").all(p.slug) as ImageRow[];
    const counts = { real: 0, style: 0, generated: 0, approved: 0, export: 0, pendingReview: 0 };
    for (const img of images) {
      counts[img.kind as ImageKind]++;
      if (img.kind === "generated" && img.status === "pending") counts.pendingReview++;
    }
    const cover =
      images.find((i) => i.kind === "approved")?.rel ?? images.find((i) => i.kind === "real")?.rel ?? null;
    const activeJobs = (
      d.prepare("SELECT COUNT(*) n FROM jobs WHERE product = ? AND status IN ('queued','running')").get(p.slug) as {
        n: number;
      }
    ).n;
    return { ...p, cover, counts, activeJobs };
  });
}

export function getProduct(slug: string) {
  syncProduct(slug);
  const { stage } = requireProduct(slug);
  const d = db();
  const images = d.prepare("SELECT * FROM images WHERE product = ? ORDER BY created_at DESC, id DESC").all(slug) as ImageRow[];
  const jobs = d
    .prepare("SELECT * FROM jobs WHERE product = ? ORDER BY created_at DESC LIMIT 50")
    .all(slug) as JobRow[];
  return { slug, stage, meta: readMeta(slug), images, jobs };
}

export function getImage(id: number): ImageRow {
  const row = db().prepare("SELECT * FROM images WHERE id = ?").get(id) as ImageRow | undefined;
  if (!row) throw new HttpError(404, `Imagem ${id} não encontrada`);
  return row;
}

export function imagePath(img: ImageRow): string {
  return productFile(img.product, img.rel);
}

function uniqueRel(dir: string, sub: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = fileName;
  for (let i = 2; fs.existsSync(path.join(dir, sub, candidate)); i++) candidate = `${base}-${i}${ext}`;
  return path.posix.join(sub, candidate);
}

export function saveUpload(slug: string, kind: "real" | "style", fileName: string, data: Buffer): string {
  if (!IMAGE_EXT.test(fileName)) throw new HttpError(400, `Formato não suportado: ${fileName}`);
  const { dir } = requireProduct(slug);
  const sub = SUBDIRS[kind];
  fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const rel = uniqueRel(dir, sub, safeFileName(fileName));
  fs.writeFileSync(path.join(dir, rel), data);
  syncProduct(slug);
  return rel;
}

/** Registers a file just written into a product folder with its lineage. */
export function registerImage(
  slug: string,
  rel: string,
  kind: ImageKind,
  extra: { label?: string | null; jobId?: string | null; parentId?: number | null; status?: string } = {},
): number {
  const d = db();
  d.prepare(
    `INSERT INTO images (product, rel, kind, status, label, job_id, parent_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(product, rel) DO UPDATE SET kind = excluded.kind, label = excluded.label,
       job_id = excluded.job_id, parent_id = excluded.parent_id, created_at = excluded.created_at`,
  ).run(slug, rel, kind, extra.status ?? "pending", extra.label ?? null, extra.jobId ?? null, extra.parentId ?? null, now());
  return (d.prepare("SELECT id FROM images WHERE product = ? AND rel = ?").get(slug, rel) as { id: number }).id;
}

export function deleteImage(id: number) {
  const img = getImage(id);
  const abs = imagePath(img);
  if (fs.existsSync(abs)) fs.rmSync(abs);
  syncProduct(img.product);
}

/** Approving a candidate copies it into approved/ so the folder always mirrors what was accepted. */
export function approveImage(id: number): number {
  const img = getImage(id);
  if (img.kind !== "generated") throw new HttpError(400, "Só candidatas geradas podem ser aprovadas");
  const { dir } = requireProduct(img.product);
  const ext = path.extname(img.rel);
  const name = `${slugify(img.label ?? "imagem") || "imagem"}-${img.job_id ?? img.id}${ext}`;
  const rel = path.posix.join(SUBDIRS.approved, name);
  fs.mkdirSync(path.join(dir, SUBDIRS.approved), { recursive: true });
  fs.copyFileSync(imagePath(img), path.join(dir, rel));
  db().prepare("UPDATE images SET status = 'approved' WHERE id = ?").run(id);
  return registerImage(img.product, rel, "approved", { label: img.label, jobId: img.job_id, parentId: img.id });
}

export function setCandidateStatus(id: number, status: "rejected" | "pending") {
  const img = getImage(id);
  if (img.kind !== "generated") throw new HttpError(400, "Só candidatas geradas têm status");
  if (img.status === "approved") {
    // Undo the approval: drop the approved copy (and its exports).
    const d = db();
    const copies = d.prepare("SELECT * FROM images WHERE parent_id = ? AND kind = 'approved'").all(id) as ImageRow[];
    for (const copy of copies) {
      const exports = d.prepare("SELECT * FROM images WHERE parent_id = ? AND kind = 'export'").all(copy.id) as ImageRow[];
      for (const e of exports) deleteImage(e.id);
      deleteImage(copy.id);
    }
  }
  db().prepare("UPDATE images SET status = ? WHERE id = ?").run(status, id);
}

export function moveProduct(slug: string, to: Stage) {
  const { stage, dir } = requireProduct(slug);
  if (stage === to) return;
  const dest = path.join(stageDir(to), slug);
  if (fs.existsSync(dest)) throw new HttpError(409, `Já existe ${to}/${slug}`);
  fs.mkdirSync(stageDir(to), { recursive: true });
  fs.renameSync(dir, dest);
  syncProduct(slug);
}
