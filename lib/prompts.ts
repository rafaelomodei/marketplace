import type { Filament } from "./config";
import type { ProductMeta } from "./products";

export type Aspect = "1:1" | "3:4";
export type ColorMapping = { part: string; filamentId: string };

export type JobParams =
  | { type: "white-bg"; productImageIds: number[]; aspect: Aspect; extra?: string }
  | { type: "scene"; productImageIds: number[]; styleImageIds: number[]; aspect: Aspect; extra?: string }
  | { type: "recolor"; sourceImageId: number; colors: ColorMapping[]; extra?: string }
  | { type: "reframe"; sourceImageId: number; aspect: Aspect; extra?: string };

export type JobType = JobParams["type"];

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  "white-bg": "Fundo branco",
  scene: "Cenário",
  recolor: "Variação de cor",
  reframe: "Reenquadrar",
};

/** Image ids in the exact order they are attached to Codex (the prompt refers to them by position). */
export function jobInputIds(p: JobParams): number[] {
  switch (p.type) {
    case "white-bg":
      return p.productImageIds;
    case "scene":
      return [...p.productImageIds, ...p.styleImageIds];
    case "recolor":
    case "reframe":
      return [p.sourceImageId];
  }
}

const ASPECT_TEXT: Record<Aspect, string> = {
  "1:1": "square 1:1 canvas (1024x1024)",
  "3:4":
    "portrait canvas (1024x1536). Keep the product centered with generous empty margin at the top and bottom, because the image will be cropped to 3:4",
};

function imageRange(from: number, count: number): string {
  if (count === 1) return `image ${from}`;
  return `images ${from}–${from + count - 1}`;
}

function fidelityBlock(meta: ProductMeta, productRef: string, allowed: string): string {
  return [
    "PRODUCT FIDELITY — highest priority, overrides everything else:",
    `- The product is the real 3D-printed object shown in ${productRef}. Several photos are just different angles of the SAME object.`,
    "- Reproduce it EXACTLY: same silhouette, geometry, proportions, thickness, number and position of every part,",
    "  every letter / number / text spelled exactly as in the photo, decorative details, visible 3D-print layer lines and surface texture.",
    "- Do NOT redesign, simplify, stylize, add or remove any element. No extra text, logos, props on the product, or watermarks.",
    `- The ONLY thing allowed to change: ${allowed}.`,
    meta.fidelityNotes ? `- Seller notes about this product: ${meta.fidelityNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const OUTPUT_BLOCK = [
  "OUTPUT:",
  "- Use your built-in image generation tool to create the image (never draw it with code, never return a placeholder).",
  "- Produce exactly ONE final image.",
  "- When it is done, copy the generated image file into the current working directory as ./output.png.",
  "- Reply only with the absolute path of output.png.",
].join("\n");

function describeFilament(f: Filament | undefined, id: string): string {
  if (!f) return `filament "${id}"`;
  return `${f.name} (${f.line}, color ${f.hex}${f.finish ? `, ${f.finish}` : ""})`;
}

export type PromptContext = {
  meta: ProductMeta;
  filament: (id: string) => Filament | undefined;
};

export function buildPrompt(p: JobParams, ctx: PromptContext): { prompt: string; label: string } {
  const { meta } = ctx;
  const intro = `You are creating a marketplace listing photo (Shopee / Mercado Livre) for this product: "${meta.name}". ${meta.description}`.trim();
  const extra = p.extra?.trim() ? `\nEXTRA INSTRUCTIONS FROM THE SELLER:\n${p.extra.trim()}` : "";
  let body: string;
  let label: string;

  switch (p.type) {
    case "white-bg": {
      const ref = imageRange(1, p.productImageIds.length);
      label = "fundo-branco";
      body = [
        fidelityBlock(meta, ref, "the background, lighting and camera framing"),
        "",
        "TASK:",
        `- Isolate the product from ${ref} on a pure, seamless white background (#FFFFFF), professional e-commerce packshot.`,
        "- Soft, even studio lighting; a subtle natural contact shadow under the product; no reflections of other objects.",
        "- Remove hands, fingers, walls, fabrics and any other object from the original photo.",
        "- The product fills about 80% of the frame, fully visible, nothing cropped.",
        `- Format: ${ASPECT_TEXT[p.aspect]}.`,
      ].join("\n");
      break;
    }
    case "scene": {
      const n = p.productImageIds.length;
      const productRef = imageRange(1, n);
      const styleRef = imageRange(n + 1, p.styleImageIds.length);
      label = "cenario";
      body = [
        fidelityBlock(meta, productRef, "the environment, background, lighting and camera framing around the product"),
        "",
        "TASK:",
        `- ${styleRef} ${p.styleImageIds.length > 1 ? "are" : "is"} the STYLE / SCENE reference: recreate that kind of setting, mood, color grading, lighting and composition.`,
        "- If the reference shows a similar product, REPLACE it with our product (never copy the reference product).",
        "- Place our product naturally in the scene at a realistic real-world scale, in sharp focus, as the clear hero of the photo.",
        "- Photorealistic, looks like a real photo taken with a good camera. Remove hands/fingers from the original photo.",
        `- Format: ${ASPECT_TEXT[p.aspect]}.`,
      ].join("\n");
      break;
    }
    case "recolor": {
      const mapping = p.colors
        .map((c) => `  • ${c.part.trim() || "the whole product"} → ${describeFilament(ctx.filament(c.filamentId), c.filamentId)}`)
        .join("\n");
      label = `cor-${p.colors.map((c) => c.filamentId).join("-")}`;
      body = [
        fidelityBlock(meta, "image 1", "the filament colors listed below — nothing else"),
        "",
        "TASK:",
        "- Recreate image 1 identically (same scene, background, framing, lighting, shadows) but with the product printed in these filament colors:",
        mapping,
        "- Parts not listed keep their original colors. The new colors must look like real matte PLA plastic with the same print texture.",
        "- Keep the same canvas size and aspect ratio as image 1.",
      ].join("\n");
      break;
    }
    case "reframe": {
      label = `reenquadrar-${p.aspect.replace(":", "x")}`;
      body = [
        fidelityBlock(meta, "image 1", "the canvas format — extend the scene around the product"),
        "",
        "TASK:",
        "- Recreate image 1 in a different aspect ratio by extending (outpainting) the existing background/scene so it looks natural.",
        "- The product must stay identical in size relation, position in the scene, lighting and details. Do not crop the product.",
        `- Format: ${ASPECT_TEXT[p.aspect]}.`,
      ].join("\n");
      break;
    }
  }

  return { prompt: [intro, "", body, extra, "", OUTPUT_BLOCK].join("\n"), label };
}
