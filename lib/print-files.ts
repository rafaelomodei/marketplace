import { unzipSync, strFromU8 } from "fflate";
import sharp from "sharp";
import { rasterize, type RasterPart } from "./raster";

/**
 * Reading print files without a slicer: what a 3MF says about itself (plates, the picture of each plate,
 * printer and filament profiles) and the raw triangles of STL/3MF meshes for a quick picture of the piece.
 */

export const MODEL_EXT = /\.(3mf|stl)$/i;

export type FilamentSlot = { type: string; color: string; settingsId: string; costPerKg: number };
export type PlateInfo = { plate: number; name: string | null; thumb: string | null };
export type ThreeMfInfo = {
  /** Saved by a slicer with its print settings (printer, process, filaments): ready to slice/print. */
  configured: boolean;
  printer: string | null;
  process: string | null;
  filaments: FilamentSlot[];
  plates: PlateInfo[];
};

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** Plates and profiles of a 3MF (Creality Print, OrcaSlicer, Bambu Studio). Never reads the meshes. */
export function inspect3mf(data: Uint8Array): ThreeMfInfo {
  const files = unzipSync(data, { filter: (f) => f.name.startsWith("Metadata/") && !f.name.endsWith(".gcode") });
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : null);

  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(text("Metadata/project_settings.config") ?? "{}"); } catch { /* not JSON: an older slicer */ }
  const str = (k: string) => (typeof settings[k] === "string" && settings[k] ? (settings[k] as string) : null);
  const types = list(settings.filament_type);
  const filaments = types.map((type, i) => ({
    type,
    color: list(settings.filament_colour)[i] ?? "#cccccc",
    settingsId: list(settings.filament_settings_id)[i] ?? type,
    costPerKg: Number(list(settings.filament_cost)[i]) || 0,
  }));

  // Plate names live in model_settings.config: <plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="…"/>.
  const names = new Map<number, string>();
  for (const [, block] of (text("Metadata/model_settings.config") ?? "").matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const meta = Object.fromEntries([...block.matchAll(/<metadata\b([^>]*)\/>/g)].map(([, a]) => [attr(a, "key"), attr(a, "value")]));
    if (meta.plater_id && meta.plater_name) names.set(Number(meta.plater_id), meta.plater_name);
  }
  const thumbs = new Map<number, string>();
  for (const name of Object.keys(files)) {
    const m = name.match(/^Metadata\/plate_(\d+)\.png$/);
    if (m) thumbs.set(Number(m[1]), name);
  }
  const count = Math.max(0, ...thumbs.keys(), ...names.keys());
  const plates = Array.from({ length: count }, (_, i) => ({ plate: i + 1, name: names.get(i + 1) ?? null, thumb: thumbs.get(i + 1) ?? null }));

  return { configured: !!str("printer_settings_id"), printer: str("printer_settings_id"), process: str("print_settings_id"), filaments, plates };
}

/** The picture the slicer saved for a plate, if any. */
export function plateImage(data: Uint8Array, entry: string): Buffer | null {
  const files = unzipSync(data, { filter: (f) => f.name === entry });
  return files[entry] ? Buffer.from(files[entry]) : null;
}

// ---------------------------------------------------------------------------------------------------------- meshes

/** Binary or ASCII STL → triangle soup (x,y,z × 3 per triangle). */
export function stlTriangles(buf: Buffer): Float32Array {
  const count = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
  if (count && buf.length === 84 + count * 50) {
    const soup = new Float32Array(count * 9);
    for (let t = 0; t < count; t++) for (let k = 0; k < 9; k++) soup[t * 9 + k] = buf.readFloatLE(84 + t * 50 + 12 + k * 4);
    return soup;
  }
  const nums = [...buf.toString("latin1").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  return Float32Array.from(nums);
}

type Obj = { soup?: Float32Array; components: { path?: string; id: string; transform: number[] | null }[] };
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const parseTransform = (t?: string) => (t ? t.trim().split(/\s+/).map(Number) : null);
/** 3MF transforms are 3×4, row vectors: p' = p·M (translation in the last row). */
const compose = (a: number[], b: number[]) => {
  const out = new Array(12).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c] + (r === 3 ? b[9 + c] : 0);
  return out;
};

const XYZ = /<vertex\s+x="([^"]*)"\s+y="([^"]*)"\s+z="([^"]*)"/g;
const TRI = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g;

/** Vertices of a mesh body as x,y,z triples (fast path for the usual attribute order, generic fallback). */
function parseVertices(body: string): Float32Array {
  const out: number[] = [];
  for (const m of body.matchAll(XYZ)) out.push(+m[1], +m[2], +m[3]);
  if (!out.length) for (const [, a] of body.matchAll(/<vertex\b([^>]*)\/>/g)) out.push(Number(attr(a, "x")), Number(attr(a, "y")), Number(attr(a, "z")));
  return Float32Array.from(out);
}

/**
 * Objects of a 3MF model part. "triangles" gives a triangle soup per mesh (for pictures); "points" only the
 * vertices, which is enough for the size and several times faster on big models.
 */
function parseModel(xml: string, mode: "triangles" | "points" = "triangles"): Map<string, Obj> {
  const objects = new Map<string, Obj>();
  for (const [, attrs, body] of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const id = attr(attrs, "id");
    if (!id) continue;
    const obj: Obj = { components: [] };
    if (body.includes("<vertices")) {
      const verts = parseVertices(body);
      if (mode === "points") obj.soup = verts;
      else {
        let idx: number[] = [];
        for (const m of body.matchAll(TRI)) idx.push(+m[1], +m[2], +m[3]);
        if (!idx.length) idx = [...body.matchAll(/<triangle\b([^>]*)\/>/g)].flatMap(([, a]) => [Number(attr(a, "v1")), Number(attr(a, "v2")), Number(attr(a, "v3"))]);
        obj.soup = new Float32Array(idx.length * 3);
        idx.forEach((v, k) => obj.soup!.set(verts.subarray(v * 3, v * 3 + 3), k * 3));
      }
    }
    for (const [, a] of body.matchAll(/<component\b([^>]*)\/>/g))
      obj.components.push({ path: attr(a, "p:path"), id: attr(a, "objectid") ?? "", transform: parseTransform(attr(a, "transform")) });
    objects.set(id, obj);
  }
  return objects;
}

/** Every mesh placed on the build of a 3MF, already positioned (all plates together). */
export function threeMfTriangles(data: Uint8Array): Float32Array {
  const items = threeMfItems(data);
  const soup = new Float32Array(items.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of items) (soup.set(c, o), (o += c.length));
  return soup;
}

/** The triangles of each object placed on the build (one entry per piece, on any plate), already positioned. */
export function threeMfItems(data: Uint8Array, mode: "triangles" | "points" = "triangles"): Float32Array[] {
  const files = unzipSync(data, { filter: (f) => f.name.endsWith(".model") });
  const models = new Map<string, Map<string, Obj>>();
  const model = (p: string) => {
    const key = p.replace(/^\//, "");
    if (!models.has(key)) models.set(key, files[key] ? parseModel(strFromU8(files[key]), mode) : new Map());
    return models.get(key)!;
  };
  const rootName = Object.keys(files).find((n) => /^3D\/[^/]+\.model$/.test(n)) ?? "3D/3dmodel.model";
  const chunks: Float32Array[] = [];
  const place = (file: string, id: string, m: number[], depth = 0) => {
    const obj = model(file).get(id);
    if (!obj || depth > 8) return;
    if (obj.soup) {
      const out = new Float32Array(obj.soup.length);
      for (let i = 0; i < out.length; i += 3) {
        const [x, y, z] = [obj.soup[i], obj.soup[i + 1], obj.soup[i + 2]];
        for (let c = 0; c < 3; c++) out[i + c] = x * m[c] + y * m[3 + c] + z * m[6 + c] + m[9 + c];
      }
      chunks.push(out);
    }
    for (const c of obj.components) place(c.path ?? file, c.id, compose(c.transform ?? IDENTITY, m), depth + 1);
  };
  const root = strFromU8(files[rootName] ?? new Uint8Array());
  const build = root.match(/<build\b[^>]*>([\s\S]*?)<\/build>/)?.[1] ?? "";
  const items: Float32Array[] = [];
  for (const [, a] of build.matchAll(/<item\b([^>]*)\/>/g)) {
    chunks.length = 0;
    place(rootName, attr(a, "objectid") ?? "", parseTransform(attr(a, "transform")) ?? IDENTITY);
    const soup = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) (soup.set(c, o), (o += c.length));
    if (soup.length) items.push(soup);
  }
  return items;
}

/** Width (x), depth (y) and height (z) of a triangle soup or point list, in mm (one decimal). */
export function boundingSize(soup: Float32Array): Dimensions | null {
  if (!soup.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.length; i += 3)
    for (let c = 0; c < 3; c++) (min[c] = Math.min(min[c], soup[i + c])), (max[c] = Math.max(max[c], soup[i + c]));
  const r = (n: number) => Math.round(n * 10) / 10;
  return { width: r(max[0] - min[0]), depth: r(max[1] - min[1]), height: r(max[2] - min[2]) };
}

export type Dimensions = { width: number; depth: number; height: number };
/** How many pieces a model file has and, when it is a single piece, its exact size. */
export type Measure = { pieces: number; size: Dimensions | null };

export function measureModel(data: Uint8Array, kind: "3mf" | "stl"): Measure {
  const items = kind === "stl" ? [stlTriangles(Buffer.from(data))] : threeMfItems(data, "points");
  return { pieces: items.length, size: items.length === 1 ? boundingSize(items[0]) : null };
}

/** A quick 3/4 picture of the triangles, PNG. Rendered at 2× and reduced for smooth edges. */
export async function renderPreview(soup: Float32Array, color: string, size = 512, view = { azimuth: -30, elevation: 32 }, background = "#f7f7f5"): Promise<Buffer> {
  const big = size * 2;
  const parts: RasterPart[] = [{ soup, color }];
  const pixels = rasterize(parts, view, { width: big, height: big, background, margin: 0.08 });
  return sharp(Buffer.from(pixels.buffer), { raw: { width: big, height: big, channels: 4 } }).resize(size, size).png().toBuffer();
}
