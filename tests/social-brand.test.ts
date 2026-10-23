import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

process.env.STUDIO_ROOT = process.cwd();

const { socialBrandAssets, socialGenerationSkill } = await import("@/lib/config");
const { buildPrompt } = await import("@/lib/prompts");

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

  it("exposes four raster logo variants that image generation can consume", async () => {
    const assets = socialBrandAssets();
    expect(assets.map((asset) => asset.label)).toEqual([
      "LOGO OFICIAL HORIZONTAL",
      "LOGO OFICIAL EM COLUNA",
      "BRASÃO OFICIAL TRANSPARENTE",
      "ÍCONE OFICIAL EM BASE BRANCA",
    ]);
    for (const asset of assets) {
      const metadata = await sharp(asset.file).metadata();
      expect(metadata.format, asset.file).toBe("png");
      expect(metadata.hasAlpha, asset.file).toBe(true);
    }
  });

  it("numbers and requires the official logo assets in social briefs", () => {
    const assets = socialBrandAssets();
    const { prompt } = buildPrompt(
      {
        type: "social",
        productImageIds: [1, 2],
        platform: "instagram",
        format: "feed-portrait",
        objective: "Apresentar o produto",
        headline: "Design que inspira",
        cta: "Fale com a gente",
      },
      {
        meta: { name: "Produto", description: "", fidelityNotes: "", marketplaces: [] },
        filament: () => undefined,
        skill: socialGenerationSkill(),
        socialReferenceCount: 1,
        socialBrandAssets: assets.map(({ label, use }) => ({ label, use })),
      },
    );

    expect(prompt).toContain("Imagem 3: REFERÊNCIA VISUAL OBRIGATÓRIA DA MARCA");
    expect(prompt).toContain("Imagem 4: LOGO OFICIAL HORIZONTAL");
    expect(prompt).toContain("Imagem 7: ÍCONE OFICIAL EM BASE BRANCA");
    expect(prompt).toContain("ASSINATURA OBRIGATÓRIA");
    expect(prompt).toContain("Título | 88 px; entrelinha 86 px");
    expect(prompt).toContain("Cápsula do CTA | 68 px de altura");
  });
});
