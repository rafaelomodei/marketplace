import sharp from "sharp";
import { filamentCatalog } from "../config";
import { db } from "../db";
import { createProduct, deleteImage, locateProduct, saveUpload, writeMeta, type LabSource } from "../products";
import { filamentHex } from "../prompts";
import { getCreation, linkProduct } from "./creations";
import { nearestFilament } from "./filament-match";
import { isSet } from "./params";
import { rasterize, type RasterPart, type RasterView } from "./raster";
import { renderTool, requireTool } from "./server";

/** The angles of the 3D pictures sent to the Studio: the face of the piece, both sides at three quarters, its thickness. */
export const MOCKUP_VIEWS: (RasterView & { id: string; label: string })[] = [
  { id: "frente", label: "De frente", azimuth: 0, elevation: 78 },
  { id: "esquerda", label: "Três quartos, pela esquerda", azimuth: -30, elevation: 40 },
  { id: "direita", label: "Três quartos, pela direita", azimuth: 30, elevation: 40 },
  { id: "lado", label: "De lado (espessura)", azimuth: 0, elevation: 14 },
];

/**
 * Pictures of a model, as PNG: drawn twice as big and scaled down, so edges are smooth. Light grey background, so
 * white parts still show (the photos made from them get a white background anyway).
 */
export async function renderPictures(parts: RasterPart[], views: RasterView[] = MOCKUP_VIEWS, size = 1024): Promise<Buffer[]> {
  const big = size * 2;
  return Promise.all(
    views.map((v) =>
      sharp(Buffer.from(rasterize(parts, v, { width: big, height: big, background: "#e4e2df" }).buffer), { raw: { width: big, height: big, channels: 4 } })
        .resize(size, size, { kernel: "lanczos3" })
        .png()
        .toBuffer(),
    ),
  );
}

/**
 * Sends a Lab creation to the Studio as a product ready for marketplace pictures ("Gerar mockup"): renders the model on
 * the server (no browser needed — the same path the MCP uses), takes the pictures of the 3D and creates the product
 * with them, the real color of each part and the real size. Done again for the same creation, it refreshes the 3D
 * pictures and facts of the product it made before (the name, notes and pictures made since stay).
 */
export async function sendCreationToStudio(id: string): Promise<{ slug: string; created: boolean; pictures: number }> {
  const creation = getCreation(id);
  const tool = requireTool(creation.tool);
  const mockup = tool.mockup ?? {};
  const r = await renderTool(tool.id, creation.values, { preview: !!mockup.previews });

  // Real color of each printed part: the filament picked in the editor, or the closest one to the part's color.
  const catalog = filamentCatalog();
  const parts: LabSource["parts"] = r.soups.map((p) => {
    const picked = creation.colors[p.id];
    if (picked) return { label: p.name, hex: picked.hex, filamentId: picked.filamentId };
    const f = nearestFilament(catalog, p.color);
    return { label: p.name, hex: f ? filamentHex(f) : p.color, filamentId: f?.id ?? null };
  });
  const pictures = await renderPictures([
    ...r.soups.map((p, i) => ({ soup: p.soup, color: parts[i].hex })),
    ...r.previews.map((p) => ({ soup: p.soup, color: p.color })),
  ]);

  const lab: LabSource = {
    tool: tool.id,
    toolName: tool.name,
    creation: creation.id,
    parts,
    sizeMm: r.size ? (r.size.map((n) => +n.toFixed(1)) as [number, number, number]) : undefined,
    notes: mockup.notes,
    scenes: mockup.scenes,
  };

  const existing = creation.product && locateProduct(creation.product) ? creation.product : null;
  let slug: string;
  if (existing) {
    slug = existing;
    for (const img of db().prepare("SELECT id FROM images WHERE product = ? AND kind = 'render'").all(slug) as { id: number }[])
      deleteImage(img.id);
    writeMeta(slug, { lab });
  } else {
    slug = createProduct(creation.name, { description: `${tool.name} feito no Lab.`, fidelityNotes: fidelityNotes(tool.params, creation.values), lab }, { unique: true });
    linkProduct(creation.id, slug);
  }
  pictures.forEach((png, i) => saveUpload(slug, "render", `${i + 1}-${MOCKUP_VIEWS[i].id}.png`, png));
  return { slug, created: !existing, pictures: pictures.length };
}

/** What the AI must never change, from what was typed in the tool (texts letter by letter) and the model itself. */
function fidelityNotes(params: { id: string; type: string; label: string }[], values: Record<string, string | number>): string {
  const texts = params.filter((p) => p.type === "text" && isSet(values[p.id])).map((p) => `"${String(values[p.id]).trim()}"`);
  return [
    texts.length ? `O texto ${texts.join(" e ")} aparece exatamente assim, letra por letra, com a mesma fonte.` : "",
    "Formato, recortes, relevos e cores de cada parte exatamente como no modelo 3D.",
  ]
    .filter(Boolean)
    .join(" ");
}

