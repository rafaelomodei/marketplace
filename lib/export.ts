import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { marketplaces } from "./config";
import { SUBDIRS } from "./paths";
import { getImage, HttpError, imagePath, registerImage, requireProduct } from "./products";

/**
 * pad  — fit the whole image and fill the rest with white (right for white-background shots).
 * crop — fill the frame, cropping around the most interesting region (right for scenes).
 */
export type ExportMode = "pad" | "crop";

export async function renderTarget(input: string, output: string, width: number, height: number, mode: ExportMode) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const img = sharp(input).rotate().flatten({ background: "#ffffff" });
  const resized =
    mode === "pad"
      ? img.resize(width, height, { fit: "contain", background: "#ffffff" })
      : img.resize(width, height, { fit: "cover", position: sharp.strategy.attention });
  await resized.jpeg({ quality: 92, mozjpeg: true }).toFile(output);
}

/** Packshots (near-white borders) are padded so nothing is cut; scenes are cropped to fill the frame. */
export async function defaultMode(input: string): Promise<ExportMode> {
  const size = 16;
  const { data } = await sharp(input).flatten({ background: "#ffffff" }).resize(size, size, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let border = 0;
  let white = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (x > 0 && y > 0 && x < size - 1 && y < size - 1) continue;
      const i = (y * size + x) * 3;
      border++;
      if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++;
    }
  return white / border > 0.9 ? "pad" : "crop";
}

export async function exportImages(opts: {
  imageIds: number[];
  marketplace: string;
  targetIds: string[];
  mode?: ExportMode;
}): Promise<number[]> {
  const mp = marketplaces()[opts.marketplace];
  if (!mp) throw new HttpError(400, `Marketplace desconhecido: ${opts.marketplace}`);
  const targets = mp.targets.filter((t) => opts.targetIds.includes(t.id));
  if (!targets.length) throw new HttpError(400, "Escolha ao menos uma proporção");

  const created: number[] = [];
  for (const id of opts.imageIds) {
    const img = getImage(id);
    if (img.kind !== "approved") throw new HttpError(400, "Só imagens aprovadas podem ser exportadas");
    const { dir } = requireProduct(img.product);
    const base = path.basename(img.rel, path.extname(img.rel));
    for (const t of targets) {
      const rel = path.posix.join(SUBDIRS.export, opts.marketplace, t.id, `${base}.jpg`);
      const input = imagePath(img);
      await renderTarget(input, path.join(dir, rel), t.width, t.height, opts.mode ?? (await defaultMode(input)));
      created.push(registerImage(img.product, rel, "export", { label: `${opts.marketplace}/${t.id}`, parentId: img.id }));
    }
  }
  return created;
}

