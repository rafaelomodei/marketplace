import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

process.env.STUDIO_ROOT = process.cwd();

const { pureWhiteBackground } = await import("@/lib/finishing");
const { SOCIAL_SIGNATURE_FILE } = await import("@/lib/paths");
const { composeSocialPost, footerLayout, layoutTexts, officialSignature, socialZones, boxInFrame } = await import("@/lib/social-design");

const sourceHashes: Record<string, string> = {
  "favicon-verdeforma.svg": "42f51a7ab29edc10abb05ffe87924e05dac19258a1c9a8c0cc45bb89af8d25f5",
  "icon-logo-verdeforma.svg": "4633778377ac6ed78fa0bf35b5f5185fb1d0ea3a1fc36191b305be55cb16c4ba",
  "icon-verdeforma.svg": "97e2518698f70920f21cca1d189f837e695d158c7990e44c44aeb342d27f311f",
  "logo-verdeforma-coluna.svg": "17892a3fbcbab5bd62834c8da36f90e201b61a7870b62dcaa07b2a10d3cfde3d",
  "logo-verdeforma.svg": "4dcf1e017510e066940c4f328ee9aef6cf2de944425cd98081392b5b3dcabea6",
};

describe("Verde Forma social brand system", () => {
  it("preserves every official SVG byte-for-byte", () => {
    const dir = path.join(process.cwd(), "skills/verde-forma-social/assets/logos/source");
    for (const [name, expected] of Object.entries(sourceHashes)) {
      const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, name))).digest("hex");
      expect(actual, name).toBe(expected);
    }
  });

  it("keeps the official signature file byte-for-byte", () => {
    const file = path.join(process.cwd(), "skills/verde-forma-social/assets/logos/oficial/assinatura-verdeforma.png");
    const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    expect(actual).toBe("f21de623250c15aa15f11b49f4ce777bc74297758ebcefac083ca07d78505039");
  });

  it("lays headline, support, CTA and the untouched official signature over the photo", async () => {
    const sig = await officialSignature();
    expect(sig.width / sig.height).toBeGreaterThan(5);
    // Every opaque pixel of the mark exists, with the same color, in the official file.
    const keyed = await sharp(sig.png).raw().toBuffer();
    const original = await sharp(SOCIAL_SIGNATURE_FILE).ensureAlpha().raw().toBuffer();
    const colors = new Set<number>();
    for (let p = 0; p < original.length; p += 4) if (original[p + 3] === 255) colors.add((original[p] << 16) | (original[p + 1] << 8) | original[p + 2]);
    for (let p = 0; p < keyed.length; p += 4)
      if (keyed[p + 3] === 255) expect(colors.has((keyed[p] << 16) | (keyed[p + 1] << 8) | keyed[p + 2])).toBe(true);

    const cta = "Dê um toque especial ao seu Natal";
    const design = { format: "feed-portrait" as const, headline: "O Natal mora nos detalhes.", supportingText: "São os pequenos detalhes que transformam a casa.", cta };
    // The generator's 2:3 frame is cover-cropped to 4:5, never stretched.
    const photo = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#F3ECE2" } }).png().toBuffer();
    const out = await composeSocialPost(photo, design);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1080, 1350]);
    const at = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(at(1070, 10)).toEqual([0xf3, 0xec, 0xe2]);

    const { logo, cta: capsule } = footerLayout("feed-portrait", sig, 400);
    expect(logo.left).toBe(72);
    expect(Math.abs(logo.width / logo.height - sig.width / sig.height)).toBeLessThan(0.05);
    expect(capsule!.top + capsule!.height).toBeLessThan(logo.top);
    // CTA capsule (#BC8756) right above the logo, at the same left margin.
    expect(at(capsule!.left + 12, capsule!.top + 33)).toEqual([0xbc, 0x87, 0x56]);
    let brown = 0;
    for (let y = logo.top; y < logo.top + logo.height; y++)
      for (let x = logo.left; x < logo.left + logo.width; x++) {
        const [r, , b] = at(x, y);
        if (Math.abs(r - 0xa6) < 6 && Math.abs(b - 0x4a) < 8) brown++;
      }
    expect(brown).toBeGreaterThan(1000);
  });

  it("keeps the texts inside the text column, with the last headline line in italic", () => {
    for (const format of ["feed-portrait", "feed-square", "vertical"] as const) {
      const zone = socialZones(format);
      const block = layoutTexts({ format, headline: "Um começo inesquecível para uma festa muito especial", supportingText: "x ".repeat(80) });
      expect(block.box.left + block.box.width).toBeLessThanOrEqual(zone.text.left + zone.text.width);
      expect(block.box.top + block.box.height).toBeLessThan(zone.footer.top);
      expect(zone.product.left).toBeGreaterThan(zone.footer.left + zone.footer.width - 20);
      const area = boxInFrame(format, zone.text);
      expect(area.x0).toBeGreaterThanOrEqual(0);
      expect(area.y1).toBeLessThanOrEqual(100);
    }
    const two = layoutTexts({ format: "feed-portrait", headline: "Detalhes que encantam." });
    expect(two.lines.map((l) => l.text)).toEqual(["Detalhes que", "encantam."]);
    expect(two.lines[1].color).not.toBe(two.lines[0].color);
    expect(layoutTexts({ format: "feed-portrait", headline: "Feito | à mão" }).lines.map((l) => l.text)).toEqual(["Feito", "à mão"]);
  });

  it("turns the packshot backdrop and its soft shadow into pure white, keeping the product", async () => {
    const w = 400;
    const h = 400;
    const raw = Buffer.alloc(w * h * 3, 250);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 3;
        // Soft grey shadow fading around the base, then a grey product with a sharp outline.
        const d = Math.hypot((x - 200) / 2, y - 330);
        if (d < 60) raw.fill(Math.round(250 - 80 * (1 - d / 60)), p, p + 3);
        if (x >= 160 && x < 240 && y >= 100 && y < 320) raw.set([150, 150, 150], p);
      }
    const out = await pureWhiteBackground(await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer());
    const { data, info } = await sharp(out).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    let bottom = 0;
    for (let p = 0; p < w * h; p++) if (data[p * 3] < 200) bottom = Math.max(bottom, Math.floor(p / w));
    expect(data[(200 * w + 200) * 3]).toBe(150);
    // Below the product, where the shadow was, only pure white is left.
    for (let p = (bottom + 2) * w * 3; p < data.length; p++) expect(data[p]).toBe(255);
  });
});

describe("social canvas", () => {
  it("crops the generator frame once: a photo already at canvas size is kept as is", async () => {
    const { toCanvas } = await import("@/lib/social-design");
    const frame = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#ddd" } }).png().toBuffer();
    const once = await toCanvas(frame, "feed-portrait");
    expect(await sharp(once).metadata()).toMatchObject({ width: 1080, height: 1350 });
    const marked = await sharp(once).composite([{ input: { create: { width: 4, height: 4, channels: 3, background: "#f00" } }, left: 0, top: 0 }]).png().toBuffer();
    const twice = await toCanvas(marked, "feed-portrait");
    const { data } = await sharp(twice).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 0]);
  });
});
