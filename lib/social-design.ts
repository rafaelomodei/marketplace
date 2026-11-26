import fs from "node:fs";
// Named import: the default export is undefined once Next bundles the ESM build.
import { parse, type Font } from "opentype.js";
import sharp, { type OverlayOptions } from "sharp";
import { BRAND_FONTS, SOCIAL_SIGNATURE_FILE } from "./paths";
import type { SocialFormat } from "./prompts";
import { BRAND, CTA, cropOf, GENERATION_FRAME, SOCIAL_CANVAS, socialZones, type Box, type SocialDesign } from "./social-layout";

export { boxInFrame, SOCIAL_CANVAS, socialZones, type Box, type SocialDesign } from "./social-layout";

/**
 * Social pieces are made the way a designer makes them: the image model shoots the photograph
 * (product integrated in the scene, with calm space left for the texts) and code lays the graphic
 * layer on top — headline, supporting text, CTA and the official signature. Texts come out letter
 * for letter, in the brand fonts and always in the same places; the logo is the file, untouched.
 */

/** The generator's canvas is rarely the exact ratio: scale and crop it (never stretch) to the format. */
export async function toCanvas(photo: Buffer | string, format: SocialFormat): Promise<Buffer> {
  const canvas = SOCIAL_CANVAS[format];
  const frame = GENERATION_FRAME[format];
  const crop = cropOf(format);
  const meta = await sharp(photo).metadata();
  if (meta.width === canvas.width && meta.height === canvas.height) return sharp(photo).removeAlpha().png().toBuffer();
  // Any other size coming back from the generator is first brought to the expected frame ratio.
  const framed = await sharp(photo).rotate().resize(frame.width, frame.height, { fit: "cover" }).toBuffer();
  return sharp(framed)
    .resize(crop.width, crop.height)
    .extract({ left: crop.ox, top: crop.oy, width: canvas.width, height: canvas.height })
    .removeAlpha()
    .png()
    .toBuffer();
}

const fonts = new Map<string, Font>();
function font(file: string): Font {
  let f = fonts.get(file);
  if (!f) {
    const buf = fs.readFileSync(file);
    f = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    fonts.set(file, f);
  }
  return f;
}

/**
 * Glyph by glyph, with kerning. opentype.js's text shaping trips on the GSUB tables of the brand
 * fonts (it threw or dropped letters); Latin text needs no shaping beyond kerning.
 */
function glyphRun(f: Font, text: string, size: number) {
  const scale = size / f.unitsPerEm;
  const glyphs = [...text].map((ch) => f.charToGlyph(ch));
  const offsets: number[] = [];
  let x = 0;
  glyphs.forEach((g, i) => {
    offsets.push(x);
    x += (g.advanceWidth ?? 0) * scale;
    if (i < glyphs.length - 1) x += (f.getKerningValue(g, glyphs[i + 1]) || 0) * scale;
  });
  return { glyphs, offsets, width: x };
}

const advance = (f: Font, text: string, size: number) => glyphRun(f, text, size).width;

const num = (v: number) => String(Math.round(v * 100) / 100 || 0);

/**
 * SVG path data of a line of text whose baseline starts at (x, y). Serialized here: opentype's
 * toPathData glues a value rounded to "-0" onto the previous number, which breaks the glyph.
 */
function textPath(f: Font, text: string, x: number, y: number, size: number): string {
  const run = glyphRun(f, text, size);
  return run.glyphs
    .flatMap((g, i) => g.getPath(x + run.offsets[i], y, size).commands)
    .map((c) => {
      if (c.type === "Z") return "Z";
      if (c.type === "Q") return `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`;
      if (c.type === "C") return `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`;
      return `${c.type}${num(c.x)} ${num(c.y)}`;
    })
    .join("");
}

/** Greedy word wrap; explicit line breaks (or "|") from the seller are kept. */
export function wrap(f: Font, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\s*(?:\n|\|)\s*/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && advance(f, next, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** One-line headlines are split in two balanced lines: the brand look is "regular line + italic line". */
function balance(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) [best, bestDiff] = [i, diff];
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

type Line = { text: string; font: Font; size: number; color: string; x: number; baseline: number };
export type TextBlock = { lines: Line[]; box: Box };

/**
 * Headline (Playfair, last line in caramel italic) and supporting text (Poppins) inside the text
 * zone. Sizes are brand tokens; they only shrink when a long text would not fit.
 */
export function layoutTexts(design: SocialDesign): TextBlock {
  const zone = socialZones(design.format).text;
  const lines: Line[] = [];
  let y = zone.top;
  const headline = design.headline?.trim();
  if (headline) {
    const regular = font(BRAND_FONTS.title);
    const italic = font(BRAND_FONTS.emphasis);
    const start = design.format === "feed-square" ? 84 : 96;
    const linesAt = (size: number) => {
      const rows = wrap(regular, headline, size, zone.width);
      return rows.length === 1 && !/[\n|]/.test(headline) ? balance(headline) : rows;
    };
    const fits = (rows: string[], size: number) =>
      rows.every((row, i) => advance(i === rows.length - 1 && rows.length > 1 ? italic : regular, row, size) <= zone.width);
    // Two lines read best (as in the approved pieces): shrink a little for them before accepting three.
    let size = start;
    let rows = linesAt(size);
    for (const [maxLines, minSize] of [[2, start - 16], [3, 60]]) {
      for (size = start; size >= minSize; size -= 4) {
        rows = linesAt(size);
        if (rows.length <= maxLines && fits(rows, size)) break;
      }
      if (rows.length <= maxLines && fits(rows, size)) break;
    }
    size = Math.max(size, 60);
    const leading = size * 1.02;
    y += size * 0.86;
    rows.forEach((row, i) => {
      const emphasis = rows.length > 1 && i === rows.length - 1;
      lines.push({ text: row, font: emphasis ? italic : regular, size, color: emphasis ? BRAND.emphasis : BRAND.title, x: zone.left, baseline: y });
      y += leading;
    });
    y += size * 0.12 - leading + size * 0.2;
  }
  const support = design.supportingText?.trim();
  if (support) {
    const body = font(BRAND_FONTS.body);
    const width = Math.min(zone.width - 40, 500);
    let size = 34;
    let rows = wrap(body, support, size, width);
    while (rows.length > 5 && size > 26) rows = wrap(body, support, (size -= 2), width);
    const leading = size * 1.38;
    y += headline ? 44 : size;
    rows.forEach((row) => {
      lines.push({ text: row, font: body, size, color: BRAND.body, x: zone.left + 2, baseline: y });
      y += leading;
    });
    y -= leading - size * 0.3;
  }
  const right = Math.max(zone.left, ...lines.map((l) => l.x + advance(l.font, l.text, l.size)));
  return { lines, box: { left: zone.left, top: zone.top, width: Math.ceil(right - zone.left), height: Math.ceil(y - zone.top) } };
}

export type Signature = { png: Buffer; width: number; height: number };
let signature: Promise<Signature> | undefined;

/** The official signature file (logo + "Verde Forma") trimmed to its visible mark. Pixels are not touched. */
export function officialSignature(): Promise<Signature> {
  signature ??= sharp(SOCIAL_SIGNATURE_FILE)
    .ensureAlpha()
    .trim({ threshold: 0 })
    .png()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({ png: data, width: info.width, height: info.height }))
    .catch((err) => {
      signature = undefined;
      throw err;
    });
  return signature;
}

const LOGO_HEIGHT = 54;

/** Footer places: the signature at the bottom of the footer zone and the CTA capsule right above it. */
export function footerLayout(format: SocialFormat, sig: { width: number; height: number }, ctaWidth?: number) {
  const zone = socialZones(format).footer;
  const width = Math.round((sig.width * LOGO_HEIGHT) / sig.height);
  const logo: Box = { left: zone.left, top: zone.top + zone.height - LOGO_HEIGHT, width, height: LOGO_HEIGHT };
  const cta: Box | undefined = ctaWidth ? { left: zone.left, top: logo.top - CTA.gap - CTA.height, width: ctaWidth, height: CTA.height } : undefined;
  return { logo, cta };
}

function ctaShape(text: string): { width: number; draw: (x: number, y: number) => string } {
  const f = font(BRAND_FONTS.cta);
  let size = CTA.size;
  while (size > 20 && advance(f, text, size) + CTA.pad * 2 > CTA.maxWidth) size--;
  const textWidth = advance(f, text, size);
  const width = Math.max(240, Math.ceil(textWidth + CTA.pad * 2));
  return {
    width,
    draw: (x, y) =>
      `<rect x="${x}" y="${y}" width="${width}" height="${CTA.height}" rx="${CTA.height / 2}" fill="${BRAND.ctaFill}"/>` +
      `<path d="${textPath(f, text, x + (width - textWidth) / 2, y + CTA.height / 2 + size * 0.36, size)}" fill="${BRAND.ctaText}"/>`,
  };
}

/** Mean luminance and its spread in a region: tells whether dark text will read on it. */
async function regionLight(photo: Buffer, b: Box) {
  const meta = await sharp(photo).metadata();
  const left = Math.max(0, b.left);
  const top = Math.max(0, b.top);
  const width = Math.min((meta.width ?? 0) - left, b.width);
  const height = Math.min((meta.height ?? 0) - top, b.height);
  if (width <= 0 || height <= 0) return { mean: 255, spread: 0 };
  const stats = await sharp(photo).extract({ left, top, width, height }).greyscale().stats();
  return { mean: stats.channels[0].mean, spread: stats.channels[0].stdev };
}

/**
 * Lays the graphic layer over the photo: headline, supporting text, CTA and the official signature.
 * When the area behind a text is dark or busy, a soft cream veil rises from the left edge so the
 * brand colors stay readable (the photo is otherwise untouched).
 */
export async function composeSocialPost(photo: Buffer | string, design: SocialDesign): Promise<Buffer> {
  const { width: W, height: H } = SOCIAL_CANVAS[design.format];
  const base = await toCanvas(photo, design.format);
  const texts = layoutTexts(design);
  const sig = await officialSignature();
  const cta = design.cta?.trim() ? ctaShape(design.cta.trim()) : undefined;
  const footer = footerLayout(design.format, sig, cta?.width);
  const footerBox: Box = footer.cta
    ? { left: footer.cta.left, top: footer.cta.top, width: Math.max(footer.cta.width, footer.logo.width), height: footer.logo.top + footer.logo.height - footer.cta.top }
    : footer.logo;

  const veils: string[] = [];
  const pad = 36;
  for (const [i, b] of [texts.box, footerBox].entries()) {
    if (!b.height || !b.width) continue;
    const { mean, spread } = await regionLight(base, { left: b.left - 8, top: b.top - 8, width: b.width + 16, height: b.height + 16 });
    const strength = mean < 150 ? 0.82 : mean < 185 || spread > 42 ? 0.62 : 0;
    if (!strength) continue;
    const x1 = b.left + b.width + 220;
    const top = b.top - pad * 2;
    const height = b.height + pad * 4;
    veils.push(
      `<linearGradient id="v${i}h" x1="0" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${BRAND.veil}" stop-opacity="${strength}"/><stop offset="${((b.left + b.width) / x1).toFixed(3)}" stop-color="${BRAND.veil}" stop-opacity="${strength * 0.85}"/><stop offset="1" stop-color="${BRAND.veil}" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="v${i}v" x1="0" y1="${top}" x2="0" y2="${top + height}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff"/><stop offset="0.78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<mask id="v${i}m"><rect x="0" y="${top}" width="${x1}" height="${height}" fill="url(#v${i}v)"/></mask>` +
        `<rect x="0" y="${top}" width="${x1}" height="${height}" fill="url(#v${i}h)" mask="url(#v${i}m)"/>`,
    );
  }

  const paths = texts.lines.map(
    (l) => `<path d="${textPath(l.font, l.text, l.x, l.baseline, l.size)}" fill="${l.color}"/>`,
  );
  const ctaSvg = cta && footer.cta ? cta.draw(footer.cta.left, footer.cta.top) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${veils.join("")}${paths.join("")}${ctaSvg}</svg>`;

  // Width only: the height follows the original proportion, so the mark is never stretched.
  const mark = await sharp(sig.png).resize({ width: footer.logo.width, kernel: "lanczos3" }).png().toBuffer();
  const layers: OverlayOptions[] = [
    { input: Buffer.from(svg), left: 0, top: 0 },
    { input: mark, left: footer.logo.left, top: footer.logo.top },
  ];
  return sharp(base).composite(layers).png().toBuffer();
}
