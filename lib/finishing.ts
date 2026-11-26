import sharp from "sharp";

/**
 * Packshot finishing, applied by code after the image model delivers, where "almost white" is not
 * acceptable: the backdrop becomes exact #FFFFFF with no shadow, halo or floor, and the product is
 * centered at a fixed size. The product pixels are never repainted.
 */

const lum = (d: Uint8Array | Buffer, p: number) => 0.299 * d[p * 3] + 0.587 * d[p * 3 + 1] + 0.114 * d[p * 3 + 2];
const chroma = (d: Uint8Array | Buffer, p: number) => Math.max(d[p * 3], d[p * 3 + 1], d[p * 3 + 2]) - Math.min(d[p * 3], d[p * 3 + 1], d[p * 3 + 2]);

/**
 * Backdrop mask: everything reachable from the border through near-white pixels or through soft,
 * neutral gradients (contact and cast shadows, floor reflections, vignettes). A shadow fades
 * smoothly while the product outline is a sharp step, so the fill stops at the outline even when
 * the product is grey. White surfaces inside the product are not reached from the border.
 */
export function backdropMask(data: Uint8Array | Buffer, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const white = (p: number) => Math.min(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]) >= 236 && chroma(data, p) <= 12;
  const visit = (p: number, from: number) => {
    if (seen[p]) return;
    const soft = chroma(data, p) <= 22 && lum(data, p) >= 95 && Math.abs(lum(data, p) - lum(data, from)) <= 6;
    if (white(p) || (from >= 0 && soft)) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) visit(x, -1), visit((h - 1) * w + x, -1);
  for (let y = 0; y < h; y++) visit(y * w, -1), visit(y * w + w - 1, -1);
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    if (x > 0) visit(p - 1, p);
    if (x < w - 1) visit(p + 1, p);
    if (p >= w) visit(p - w, p);
    if (p < w * (h - 1)) visit(p + w, p);
  }
  return seen;
}

/** Bounding box of the product (non-backdrop), ignoring dust smaller than 0.05% of the image. */
function productBox(mask: Uint8Array, w: number, h: number) {
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let p = 0; p < w * h; p++)
    if (!mask[p]) {
      rows[Math.floor(p / w)]++;
      cols[p % w]++;
    }
  const min = 2;
  const first = (a: Uint32Array) => a.findIndex((v) => v >= min);
  const last = (a: Uint32Array) => a.length - 1 - [...a].reverse().findIndex((v) => v >= min);
  const top = first(rows);
  const left = first(cols);
  if (top < 0 || left < 0) return null;
  return { left, top, width: last(cols) - left + 1, height: last(rows) - top + 1 };
}

/**
 * Pure white packshot: the backdrop (with any shadow) becomes #FFFFFF, the product edge is lightly
 * feathered, and the product is centered taking `fill` of the larger canvas side.
 */
export async function pureWhiteBackground(input: string | Buffer, fill = 0.82): Promise<Buffer> {
  const { data, info } = await sharp(input).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const mask = backdropMask(data, w, h);
  const out = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    let a = 0;
    if (!mask[p]) {
      // Outline pixels (touching the backdrop) blend halfway to white: no dark fringe, no jaggies.
      const x = p % w;
      const edge = (x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (p >= w && mask[p - w]) || (p < w * (h - 1) && mask[p + w]);
      a = edge ? 0.6 : 1;
    }
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(data[p * 3 + c] * a + 255 * (1 - a));
  }
  const box = productBox(mask, w, h);
  const flat = sharp(out, { raw: { width: w, height: h, channels: 3 } });
  if (!box) return flat.png().toBuffer();
  const scale = Math.min((w * fill) / box.width, (h * fill) / box.height);
  const pw = Math.max(1, Math.round(box.width * scale));
  const ph = Math.max(1, Math.round(box.height * scale));
  const product = await flat.extract(box).resize(pw, ph, { kernel: "lanczos3" }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: "#FFFFFF" } })
    .composite([{ input: product, left: Math.round((w - pw) / 2), top: Math.round((h - ph) / 2) }])
    .removeAlpha()
    .png()
    .toBuffer();
}
