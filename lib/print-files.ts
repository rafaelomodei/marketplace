import fs from "node:fs";
import sharp from "sharp";
import { rasterizeAsync, type RasterMesh } from "./raster";
import { runAsync, runSync, type Work } from "./work";
import { withZip, Zip } from "./zip";

/**
 * Reading print files without a slicer: what a 3MF says about itself (plates, the picture of each plate,
 * printer and filament profiles) and the meshes of STL/3MF files for the size and a quick picture of the piece.
 *
 * Light on memory by design: a 3MF is opened through its zip directory and only the entries needed are inflated
 * (one at a time); the XML of a mesh is scanned in windows (never turned into one giant string) straight into
 * typed arrays; and meshes are only read for the pieces that need them (sizing reads none when the file has
 * several pieces). Exported as sync functions (tests, small files) and async ones that let the server breathe.
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

/** A 3MF: its bytes or the path of the file (read piece by piece). */
type Input = Uint8Array | string;

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** Plates and profiles of a 3MF (Creality Print, OrcaSlicer, Bambu Studio). Reads only the small Metadata entries. */
export function inspect3mf(input: Input): ThreeMfInfo {
  return withZip(input, (zip) => {
    let settings: Record<string, unknown> = {};
    try { settings = JSON.parse(zip.text("Metadata/project_settings.config") ?? "{}"); } catch { /* not JSON: an older slicer */ }
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
    for (const [, block] of (zip.text("Metadata/model_settings.config") ?? "").matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
      const meta = Object.fromEntries([...block.matchAll(/<metadata\b([^>]*)\/>/g)].map(([, a]) => [attr(a, "key"), attr(a, "value")]));
      if (meta.plater_id && meta.plater_name) names.set(Number(meta.plater_id), meta.plater_name);
    }
    const thumbs = new Map<number, string>();
    for (const name of zip.names()) {
      const m = name.match(/^Metadata\/plate_(\d+)\.png$/);
      if (m) thumbs.set(Number(m[1]), name);
    }
    const count = Math.max(0, ...thumbs.keys(), ...names.keys());
    const plates = Array.from({ length: count }, (_, i) => ({ plate: i + 1, name: names.get(i + 1) ?? null, thumb: thumbs.get(i + 1) ?? null }));

    return { configured: !!str("printer_settings_id"), printer: str("printer_settings_id"), process: str("print_settings_id"), filaments, plates };
  });
}

/** The picture the slicer saved for a plate, if any (only that entry is read). */
export function plateImage(input: Input, entry: string): Buffer | null {
  return withZip(input, (zip) => zip.read(entry));
}

// ---------------------------------------------------------------------------------------------------------- STL

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

/** Size of an STL on disk, read in slices (a binary STL is never loaded whole). */
function* stlFileSize(file: string): Work<Dimensions | null> {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(84);
    fs.readSync(fd, head, 0, 84, 0);
    const count = size >= 84 ? head.readUInt32LE(80) : 0;
    if (!count || size !== 84 + count * 50) return boundingSize(stlTriangles(fs.readFileSync(file)));
    const b = new Bounds();
    const per = 20_000;
    const buf = Buffer.alloc(per * 50);
    for (let t = 0; t < count; t += per) {
      const n = Math.min(per, count - t);
      fs.readSync(fd, buf, 0, n * 50, 84 + t * 50);
      for (let i = 0; i < n; i++) for (let v = 0; v < 3; v++) b.add(buf.readFloatLE(i * 50 + 12 + v * 12), buf.readFloatLE(i * 50 + 16 + v * 12), buf.readFloatLE(i * 50 + 20 + v * 12));
      yield;
    }
    return b.size();
  } finally {
    fs.closeSync(fd);
  }
}

// ------------------------------------------------------------------------------------------------------ 3MF XML

type Mesh = { verts: Float32Array; tris: Uint32Array | null };
type Component = { path: string | null; id: string; transform: number[] | null };
type Obj = { hasMesh: boolean; mesh: Mesh | null; components: Component[] };
type Item = { id: string; transform: number[] | null };
type Model = { objects: Map<string, Obj>; items: Item[] };
/** "structure" = objects, components and build only; "points" adds vertices; "triangles" adds faces. */
type Detail = "structure" | "points" | "triangles";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const parseTransform = (t?: string) => (t ? t.trim().split(/\s+/).map(Number) : null);
/** 3MF transforms are 3×4, row vectors: p' = p·M (translation in the last row). */
const compose = (a: number[], b: number[]) => {
  const out = new Array(12).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c] + (r === 3 ? b[9 + c] : 0);
  return out;
};

/** A typed array that grows (vertices and faces arrive without a count). */
class Grow<A extends Float32Array | Uint32Array> {
  n = 0;
  constructor(public a: A, private make: (n: number) => A) {}
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) {
      const b = this.make(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = x;
    this.a[this.n++] = y;
    this.a[this.n++] = z;
  }
  done(): A {
    return this.a.slice(0, this.n) as A;
  }
}
const floats = () => new Grow(new Float32Array(3 * 4096), (n) => new Float32Array(n));
const uints = () => new Grow(new Uint32Array(3 * 8192), (n) => new Uint32Array(n));

const WINDOW = 4 << 20;

// Bytes of the XML that matter, as char codes.
const LT = 60, GT = 62, EQ = 61, SLASH = 47, QUOTE = 34, APOS = 39, MINUS = 45, PLUS = 43, DOT = 46;
const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;
const isEnd = (c: number) => isSpace(c) || c === SLASH || c === GT;
const isDigit = (c: number) => c >= 48 && c <= 57;
const VERTEX = Buffer.from("<vertex");
const TRIANGLE = Buffer.from("<triangle");
const POW10 = Array.from({ length: 23 }, (_, i) => 10 ** i);

/** Whether the bytes at `at` are `word` followed by a space, `/` or `>`. */
function startsTag(xml: Buffer, at: number, word: Buffer) {
  for (let k = 0; k < word.length; k++) if (xml[at + k] !== word[k]) return false;
  return isEnd(xml[at + word.length]);
}

/** A decimal number written between `s` and `e` ("-12.5", "3e-05"), read straight from the bytes. */
function parseNumber(xml: Buffer, s: number, e: number): number {
  let i = s;
  let neg = false;
  if (xml[i] === MINUS) (neg = true), i++;
  else if (xml[i] === PLUS) i++;
  let v = 0;
  let digits = 0;
  while (i < e && isDigit(xml[i])) (v = v * 10 + (xml[i++] - 48)), digits++;
  if (i < e && xml[i] === DOT) {
    i++;
    let frac = 0;
    let n = 0;
    while (i < e && isDigit(xml[i])) {
      if (n < 22) (frac = frac * 10 + (xml[i] - 48)), n++;
      i++, digits++;
    }
    v += frac / POW10[n];
  }
  if (i < e && (xml[i] === 101 || xml[i] === 69)) {
    i++;
    let eneg = false;
    if (xml[i] === MINUS) (eneg = true), i++;
    else if (xml[i] === PLUS) i++;
    let ex = 0;
    while (i < e && isDigit(xml[i])) ex = ex * 10 + (xml[i++] - 48);
    v *= 10 ** (eneg ? -ex : ex);
  }
  if (i !== e || !digits) return Number(xml.toString("latin1", s, e)); // anything unusual: let JS decide
  return neg ? -v : v;
}

const three = new Float64Array(3);

/**
 * Reads the attributes of a tag from `p` up to its `>` and keeps three numbers in `three`: x/y/z for a vertex
 * (`pair` false: one-letter names) or v1/v2/v3 for a triangle (`pair` true). Returns the position of the `>`.
 */
function numericAttrs(xml: Buffer, p: number, pair: boolean): number {
  three[0] = three[1] = three[2] = NaN;
  const n = xml.length;
  while (p < n) {
    const c = xml[p];
    if (c === GT) return p;
    if (isSpace(c) || c === SLASH) { p++; continue; }
    const ns = p;
    while (p < n && xml[p] !== EQ && xml[p] !== GT && !isSpace(xml[p])) p++;
    const ne = p;
    while (p < n && isSpace(xml[p])) p++;
    if (xml[p] !== EQ) continue;
    p++;
    while (p < n && isSpace(xml[p])) p++;
    const q = xml[p];
    if (q !== QUOTE && q !== APOS) continue;
    const vs = p + 1;
    let ve = vs;
    while (ve < n && xml[ve] !== q) ve++;
    if (ve >= n) return n;
    const k = pair ? (ne - ns === 2 && xml[ns] === 118 ? xml[ns + 1] - 49 : -1) : ne - ns === 1 ? xml[ns] - 120 : -1;
    if (k >= 0 && k < 3) three[k] = parseNumber(xml, vs, ve);
    p = ve + 1;
  }
  return n;
}

/** Scanning state of one .model part (kept outside the generator: V8 optimizes plain methods much better). */
class ModelScanner {
  objects = new Map<string, Obj>();
  items: Item[] = [];
  private cur: Obj | null = null;
  private keep = false;
  private inBuild = false;
  private verts = floats();
  private tris = uints();

  constructor(private xml: Buffer, private detail: Detail, private want?: Set<string>) {}

  /** Scans the tags starting before `end` (from `start`) and returns where the next scan starts. */
  scan(start: number, end: number): number {
    const xml = this.xml;
    const n = xml.length;
    let i = start;
    while (i < end) {
      // Plain loops over the bytes: Buffer.indexOf costs a native call each time, too much for millions of tags.
      while (i < n && xml[i] !== LT) i++;
      if (i >= n) return n;
      const c = xml[i + 1];
      if (c === 118 && startsTag(xml, i, VERTEX)) {
        if (this.keep) (i = numericAttrs(xml, i + 7, false)), this.verts.push3(three[0], three[1], three[2]);
        i++;
        continue;
      }
      if (c === 116 && startsTag(xml, i, TRIANGLE)) {
        if (this.keep && this.detail === "triangles") (i = numericAttrs(xml, i + 9, true)), this.tris.push3(three[0], three[1], three[2]);
        i++;
        continue;
      }
      // Structural tags (object, vertices, component, build, item and their ends): few, so read as text.
      if (c !== 111 && c !== 118 && c !== 99 && c !== 98 && c !== 105 && c !== SLASH) {
        i++;
        continue;
      }
      let gt = i;
      while (gt < n && xml[gt] !== GT) gt++;
      if (gt >= n) return n;
      this.tag(xml.toString("latin1", i, gt + 1));
      i = gt + 1;
    }
    return i;
  }

  private tag(tag: string) {
    const name = tag.match(/^<(\/?[\w:]+)/)?.[1];
    if (name === "object") {
      const id = attr(tag, "id");
      if (!id) return;
      this.cur = { hasMesh: false, mesh: null, components: [] };
      this.objects.set(id, this.cur);
      this.keep = this.detail !== "structure" && (!this.want || this.want.has(id));
      this.verts = floats();
      this.tris = uints();
    } else if (name === "/object") {
      if (this.cur && this.keep && this.cur.hasMesh) this.cur.mesh = { verts: this.verts.done(), tris: this.detail === "triangles" ? this.tris.done() : null };
      this.cur = null;
      this.keep = false;
    } else if (name === "vertices") {
      if (this.cur) this.cur.hasMesh = true;
    } else if (name === "component") {
      this.cur?.components.push({ path: attr(tag, "p:path") ?? null, id: attr(tag, "objectid") ?? "", transform: parseTransform(attr(tag, "transform")) });
    } else if (name === "build") this.inBuild = true;
    else if (name === "/build") this.inBuild = false;
    else if (name === "item" && this.inBuild) this.items.push({ id: attr(tag, "objectid") ?? "", transform: parseTransform(attr(tag, "transform")) });
  }
}

/**
 * The objects and build items of one .model part. The bytes are scanned in place (no giant string): vertices and
 * faces go straight into typed arrays, and only the rare structural tags are turned into text. Meshes are kept
 * only for objects in `want` (all when absent) and only at the detail asked.
 */
function* parseModel(xml: Buffer, detail: Detail, want?: Set<string>): Work<Model> {
  const scanner = new ModelScanner(xml, detail, want);
  for (let i = 0; i < xml.length; ) {
    i = scanner.scan(i, i + WINDOW);
    yield;
  }
  return { objects: scanner.objects, items: scanner.items };
}

const partName = (p: string) => p.replace(/^\//, "");
const rootPart = (zip: Zip) => (zip.entries.has("3D/3dmodel.model") ? "3D/3dmodel.model" : (zip.names().find((n) => /^3D\/[^/]+\.model$/.test(n)) ?? "3D/3dmodel.model"));

type Placement = { mesh: Mesh; m: number[] };
type Build = { root: string; parts: Map<string, Map<string, Obj>>; pieces: Item[] };

/** Visits every mesh of a build item with its full transform. */
function place(b: Build, item: Item, visit: (p: Placement) => void) {
  const walk = (file: string, id: string, m: number[], depth: number) => {
    const obj = b.parts.get(file)?.get(id);
    if (!obj || depth > 8) return;
    if (obj.mesh) visit({ mesh: obj.mesh, m });
    for (const c of obj.components) walk(c.path ? partName(c.path) : file, c.id, compose(c.transform ?? IDENTITY, m), depth + 1);
  };
  walk(b.root, item.id, item.transform ?? IDENTITY, 0);
}

/**
 * The build of a 3MF: its pieces (items that lead to a mesh) and, at the detail asked, the meshes of the pieces
 * chosen by `pick` only. Each .model part is inflated once (one at a time) and dropped after scanning.
 */
function* loadBuild(zip: Zip, detail: Detail, pick: (pieces: Item[]) => Item[] = (p) => p): Work<Build> {
  const root = rootPart(zip);
  const rootModel = yield* parseModel(zip.read(root) ?? Buffer.alloc(0), "structure");
  const parts = new Map([[root, rootModel.objects]]);
  // Parts not read yet are assumed to hold meshes (Creality/Bambu keep each object in 3D/Objects/*.model).
  const leads = (file: string, id: string, depth = 0): boolean => {
    const objects = parts.get(file);
    if (!objects) return zip.entries.has(file);
    const obj = objects.get(id);
    return !!obj && depth <= 8 && (obj.hasMesh || obj.components.some((c) => leads(c.path ? partName(c.path) : file, c.id, depth + 1)));
  };
  const pieces = rootModel.items.filter((it) => leads(root, it.id));
  const build: Build = { root, parts, pieces };
  if (detail === "structure") return build;

  const chosen = pick(pieces);
  const asked = new Map<string, Set<string>>();
  for (let round = 0; round < 8; round++) {
    const missing = new Map<string, Set<string>>();
    const visit = (file: string, id: string, depth: number) => {
      if (depth > 8) return;
      const obj = parts.get(file)?.get(id);
      if ((!obj || (obj.hasMesh && !obj.mesh)) && !asked.get(file)?.has(id)) {
        if (!missing.has(file)) missing.set(file, new Set());
        missing.get(file)!.add(id);
      }
      for (const c of obj?.components ?? []) visit(c.path ? partName(c.path) : file, c.id, depth + 1);
    };
    for (const it of chosen) visit(root, it.id, 0);
    if (!missing.size) break;
    for (const [file, ids] of missing) {
      const want = asked.get(file) ?? new Set<string>();
      ids.forEach((id) => want.add(id));
      asked.set(file, want);
      const xml = zip.read(file);
      if (!xml) continue;
      const model = yield* parseModel(xml, detail, want);
      const known = parts.get(file) ?? new Map<string, Obj>();
      for (const [id, obj] of model.objects) if (!known.get(id)?.mesh) known.set(id, obj);
      parts.set(file, known);
    }
  }
  return build;
}

// ---------------------------------------------------------------------------------------------------- measures

export type Dimensions = { width: number; depth: number; height: number };
/** How many pieces a model file has and, when it is a single piece, its exact size. */
export type Measure = { pieces: number; size: Dimensions | null };

class Bounds {
  min = [Infinity, Infinity, Infinity];
  max = [-Infinity, -Infinity, -Infinity];
  add(x: number, y: number, z: number) {
    if (x < this.min[0]) this.min[0] = x;
    if (x > this.max[0]) this.max[0] = x;
    if (y < this.min[1]) this.min[1] = y;
    if (y > this.max[1]) this.max[1] = y;
    if (z < this.min[2]) this.min[2] = z;
    if (z > this.max[2]) this.max[2] = z;
  }
  size(): Dimensions | null {
    if (!Number.isFinite(this.min[0])) return null;
    const r = (n: number) => Math.round(n * 10) / 10;
    return { width: r(this.max[0] - this.min[0]), depth: r(this.max[1] - this.min[1]), height: r(this.max[2] - this.min[2]) };
  }
}

/** Width (x), depth (y) and height (z) of a triangle soup or point list, in mm (one decimal). */
export function boundingSize(soup: Float32Array): Dimensions | null {
  const b = new Bounds();
  for (let i = 0; i < soup.length; i += 3) b.add(soup[i], soup[i + 1], soup[i + 2]);
  return b.size();
}

const transformed = ({ mesh, m }: Placement) => {
  const v = mesh.verts;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 3)
    for (let c = 0; c < 3; c++) out[i + c] = v[i] * m[c] + v[i + 1] * m[3 + c] + v[i + 2] * m[6 + c] + m[9 + c];
  return out;
};

/** Pieces of a 3MF and, for a single piece, its size: the meshes are not even read when there are several. */
function* measure3mf(zip: Zip): Work<Measure> {
  const build = yield* loadBuild(zip, "points", (pieces) => (pieces.length === 1 ? pieces : []));
  if (build.pieces.length !== 1) return { pieces: build.pieces.length, size: null };
  const b = new Bounds();
  place(build, build.pieces[0], ({ mesh, m }) => {
    const v = mesh.verts;
    for (let i = 0; i < v.length; i += 3) {
      const [x, y, z] = [v[i], v[i + 1], v[i + 2]];
      b.add(x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]);
    }
  });
  const size = b.size();
  return { pieces: size ? 1 : 0, size };
}

export function measureModel(data: Uint8Array, kind: "3mf" | "stl"): Measure {
  if (kind === "stl") {
    return { pieces: 1, size: boundingSize(stlTriangles(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) };
  }
  return withZip(data, (zip) => runSync(measure3mf(zip)));
}

/** Same as `measureModel`, reading the file from disk piece by piece and pausing now and then for the server. */
export async function measureModelFile(file: string, kind: "3mf" | "stl"): Promise<Measure> {
  if (kind === "stl") {
    return { pieces: 1, size: await runAsync(stlFileSize(file)) };
  }
  const zip = new Zip(file);
  try {
    return await runAsync(measure3mf(zip));
  } finally {
    zip.close();
  }
}

// ------------------------------------------------------------------------------------------------------ meshes

/** Indexed meshes of every piece on the build, positioned (shared faces, no triangle soup: 3× less memory). */
function* meshes3mf(zip: Zip, onlyFirst = false): Work<RasterMesh[][]> {
  const build = yield* loadBuild(zip, "triangles", (pieces) => (onlyFirst ? pieces.slice(0, 1) : pieces));
  return (onlyFirst ? build.pieces.slice(0, 1) : build.pieces).map((item) => {
    const out: RasterMesh[] = [];
    place(build, item, (p) => out.push({ soup: transformed(p), index: p.mesh.tris ?? undefined }));
    return out;
  });
}

/** A triangle soup from indexed meshes (for callers that want plain triangles). */
function toSoup(parts: RasterMesh[]): Float32Array {
  const total = parts.reduce((n, p) => n + (p.index ? p.index.length * 3 : p.soup.length), 0);
  const soup = new Float32Array(total);
  let o = 0;
  for (const { soup: v, index } of parts) {
    if (!index) (soup.set(v, o), (o += v.length));
    else for (let k = 0; k < index.length; k++, o += 3) soup.set(v.subarray(index[k] * 3, index[k] * 3 + 3), o);
  }
  return soup;
}

/** The triangles of each object placed on the build (one entry per piece, on any plate), already positioned. */
export function threeMfItems(data: Input, mode: "triangles" | "points" = "triangles"): Float32Array[] {
  return withZip(data, (zip) =>
    runSync(meshes3mf(zip)).map((parts) => (mode === "points" ? toSoup(parts.map((p) => ({ soup: p.soup }))) : toSoup(parts))),
  );
}

/** Every mesh placed on the build of a 3MF, already positioned (all plates together). */
export function threeMfTriangles(data: Input): Float32Array {
  return toSoup(withZip(data, (zip) => runSync(meshes3mf(zip))).flat());
}

/** The meshes of a model file on disk, for pictures (STL: one soup; 3MF: indexed meshes of every piece). */
export async function modelMeshesFile(file: string, kind: "3mf" | "stl", onlyFirstPiece = false): Promise<RasterMesh[]> {
  if (kind === "stl") return [{ soup: stlTriangles(fs.readFileSync(file)) }];
  const zip = new Zip(file);
  try {
    return (await runAsync(meshes3mf(zip, onlyFirstPiece))).flat();
  } finally {
    zip.close();
  }
}

// ----------------------------------------------------------------------------------------------------- picture

/** A quick 3/4 picture of the triangles, PNG. Rendered at 2× and reduced for smooth edges. */
export async function renderPreview(model: Float32Array | RasterMesh[], color: string, size = 512, view = { azimuth: -30, elevation: 32 }, background = "#f7f7f5"): Promise<Buffer> {
  const big = size * 2;
  const parts = (model instanceof Float32Array ? [{ soup: model }] : model).map((m) => ({ ...m, color }));
  const pixels = await rasterizeAsync(parts, view, { width: big, height: big, background, margin: 0.08 });
  return sharp(Buffer.from(pixels.buffer), { raw: { width: big, height: big, channels: 4 } }).resize(size, size).png().toBuffer();
}
