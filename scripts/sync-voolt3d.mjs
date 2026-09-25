// Syncs the Voolt3D PLA catalog: colors, lines (finish/texture), tags and reference photos.
// Writes config/filaments.json and downloads photos to assets/filaments/voolt3d/<id>/ (git-ignored).
//   node scripts/sync-voolt3d.mjs            # full sync
//   node scripts/sync-voolt3d.mjs --no-images
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BASE = "https://voolt3d.com.br";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ASSETS = path.join(ROOT, "assets", "filaments", "voolt3d");
const OUT = path.join(ROOT, "config", "filaments.json");
const NO_IMAGES = process.argv.includes("--no-images");
const UA = { "User-Agent": "Mozilla/5.0 (marketplace-studio catalog sync)" };

/**
 * PLA lines of the store. `finish` is what the image model is told about the material look;
 * it was written from each line's description on the site — edit freely.
 */
const LINES = [
  { id: "cores-solidas", slug: "coressolidas", name: "PLA High Speed", finish: "standard solid PLA: smooth satin surface, sharp details, fine visible layer lines, opaque color" },
  { id: "evo", slug: "evo", name: "PLA EVO", finish: "PLA EVO: smooth satin surface, fine visible layer lines, opaque color" },
  { id: "velvet", slug: "velvet", name: "PLA Velvet", finish: "matte velvet finish: soft, non-reflective, layer lines barely visible, velvety look" },
  { id: "macaron", slug: "macaron", name: "PLA Velvet Macaron", finish: "matte velvet finish in a soft pastel (macaron) tone: non-reflective, layer lines barely visible" },
  { id: "v-silk", slug: "v-silk", name: "PLA V-Silk", finish: "silk finish: smooth, uniform and highly reflective, intense glossy sheen with soft highlights" },
  { id: "neon", slug: "neon", name: "PLA Neon V-Silk", finish: "fluorescent neon color, very saturated, with the glossy reflective silk finish" },
  { id: "stone", slug: "stone", name: "PLA Stone", finish: "stone effect: matte, slightly rough mineral texture with discreet dark granules, earthy natural-stone look" },
  { id: "wood", slug: "wood", name: "PLA Wood", finish: "wood effect with real wood particles: matte, slightly porous texture, organic look of carved natural wood" },
  { id: "tri-color", slug: "tri-color", name: "PLA Tri Color V-Silk", finish: "tri-color silk: three colors in one strand, the color changes across the part and with the viewing angle, intense silk gloss" },
  { id: "duo-color-shadow", slug: "duo-color-shadow", name: "PLA Shadow V-Silk", finish: "shadow silk 70/30: the main color is shaded by the darker second color with smooth transitions across the part, intense silk gloss" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res;
    if (attempt >= 3) throw new Error(`${res.status} ${url}`);
    await sleep(1000 * attempt);
  }
}
const text = async (url) => (await get(url)).text();

const decodeJs = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const decodeHtml = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

async function productUrls(line) {
  const urls = new Set();
  for (let page = 1; page < 20; page++) {
    const html = await text(`${BASE}/pla/${line.slug}/${page > 1 ? `page/${page}/` : ""}`);
    // Only single filaments — skips kits (several spools) and other products listed in the category.
    const found = [...html.matchAll(/href="(https:\/\/voolt3d\.com\.br\/produtos\/filamento-[^"]+)"/g)].map((m) => m[1]);
    const before = urls.size;
    found.forEach((u) => urls.add(u));
    if (urls.size === before) break;
    await sleep(400);
  }
  return [...urls];
}

function parseProduct(html, url) {
  const title = decodeHtml(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "");
  const tagsBlock = html.match(/tags\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const tags = [...tagsBlock.matchAll(/'([^']*)'/g)].map((m) => decodeJs(m[1]));
  const slider = html.slice(html.indexOf("js-product-slider"), html.indexOf("js-product-slider") + 30000);
  const images = [...new Set([...slider.matchAll(/<a href="(\/\/acdn[^"]+)"/g)].map((m) => `https:${m[1]}`))];
  return { url, title, tags, images };
}

/** "Filamento PLA Rosa Bebê Velvet High Speed Premium - 1Kg" → "Rosa Bebê" */
function colorName(title, line) {
  let name = title
    .split("|")[0]
    .replace(/^Filamento\s+PLA\s+/i, "")
    .replace(/\b(Duo Color|PLA com Part[ií]culas de Madeira|Tri)\b/gi, "")
    .replace(/\s*-\s*1\s*Kg.*$/i, "")
    .replace(/\b(High Speed|Premium|Voolt3D|1kg)\b/gi, "");
  for (const word of line.name.replace(/^PLA\s+/, "").split(/\s+/)) name = name.replace(new RegExp(`\\b${word}\\b`, "i"), "");
  return name.replace(/\s+/g, " ").replace(/^[\s\-–|]+|[\s\-–|]+$/g, "").trim() || title;
}

const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Classifies a gallery photo by the store's file naming, falling back to the image content. */
async function imageRole(url, file) {
  const name = url.split("/").pop();
  if (/^peca/i.test(name)) return "part"; // printed part on white — best color + texture reference
  if (/-f-[0-9a-f]{10,}/i.test(name)) return "spool-side"; // spool seen from the side — pure filament color
  if (/-lp-[0-9a-f]{10,}/i.test(name)) return "spool-part"; // spool with a printed part
  if (/-l-[0-9a-f]{10,}/i.test(name)) return "spool";
  return roleFromContent(file);
}

/** Narrow silhouette = spool side view; no black reel = printed part; otherwise a spool shot. */
async function roleFromContent(file) {
  const size = 64;
  const { data } = await sharp(file).resize(size, size, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let [minX, minY, maxX, maxY, fg, dark] = [size, size, 0, 0, 0, 0];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 238) continue;
      fg++;
      if (lum < 45) dark++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  if (!fg) return "spool";
  if ((maxX - minX + 1) / (maxY - minY + 1) < 0.5) return "spool-side";
  return dark / fg < 0.08 ? "part" : "spool";
}

/** Median color of pixels that differ from the (white) background. */
async function dominantHex(file, crop) {
  let img = sharp(file).flatten({ background: "#ffffff" });
  const meta = await img.metadata();
  if (crop) {
    const { width = 0, height = 0 } = meta;
    img = img.extract({
      left: Math.round(width * crop[0]),
      top: Math.round(height * crop[1]),
      width: Math.round(width * (crop[2] - crop[0])),
      height: Math.round(height * (crop[3] - crop[1])),
    });
  }
  const { data } = await img.resize(96, 96, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (!crop && r > 238 && g > 238 && b > 238) continue; // background
    px.push([r, g, b]);
  }
  if (px.length < 20) return null;
  const median = (k) => px.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(px.length / 2)];
  return "#" + [0, 1, 2].map((k) => median(k).toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function download(url, dest) {
  if (fs.existsSync(dest)) return;
  const buf = Buffer.from(await (await get(url)).arrayBuffer());
  await sharp(buf).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toFile(dest);
}

const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { filaments: [] };
const overrides = new Map(previous.filaments.filter((f) => f.hexOverride).map((f) => [f.id, f.hexOverride]));

// Specific lines first: broad categories (V-Silk, Velvet) also list Neon, Macaron etc.,
// and a color must be classified by its most specific line.
const PRIORITY = ["macaron", "neon", "tri-color", "duo-color-shadow", "evo", "stone", "wood", "velvet", "v-silk", "cores-solidas"];
const seen = new Set();
const filaments = [];
for (const line of [...LINES].sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id))) {
  const urls = (await productUrls(line)).filter((u) => !seen.has(u));
  urls.forEach((u) => seen.add(u));
  console.log(`${line.name}: ${urls.length} produtos`);
  for (const url of urls) {
    const p = parseProduct(await text(url), url);
    await sleep(300);
    const name = colorName(p.title, line);
    const id = `${line.id}-${slugify(name)}`;
    const entry = {
      id,
      name,
      line: line.name,
      lineId: line.id,
      hex: null,
      finish: line.finish,
      tags: p.tags.filter((t) => /efeito|brilho|fosco|silk|neon|madeira|pedra|metal/i.test(t)),
      url,
      images: [],
    };
    if (!NO_IMAGES) {
      const dir = path.join(ASSETS, id);
      fs.mkdirSync(dir, { recursive: true });
      for (const [i, imgUrl] of p.images.entries()) {
        const file = path.join(dir, `${i + 1}.jpg`);
        await download(imgUrl, file);
        const role = await imageRole(imgUrl, file);
        entry.images.push({ role, file: path.relative(ROOT, file) });
      }
      // Pure filament color: center of the spool side view; otherwise the printed part.
      const side = entry.images.find((i) => i.role === "spool-side");
      const part = entry.images.find((i) => i.role === "part");
      entry.hex =
        (side && (await dominantHex(path.join(ROOT, side.file), [0.42, 0.25, 0.58, 0.75]))) ??
        (part && (await dominantHex(path.join(ROOT, part.file)))) ??
        null;
    }
    if (overrides.has(id)) entry.hexOverride = overrides.get(id);
    filaments.push(entry);
    console.log(`  ${id.padEnd(40)} ${entry.hex ?? "-"} ${entry.images.map((i) => i.role).join(",")}`);
  }
}

const lineOrder = LINES.map((l) => l.id);
filaments.sort((a, b) => lineOrder.indexOf(a.lineId) - lineOrder.indexOf(b.lineId));

const catalog = {
  brand: "Voolt3D",
  source: `${BASE}/pla/`,
  syncedAt: new Date().toISOString(),
  note: "Gerado por scripts/sync-voolt3d.mjs. hex = cor média da foto do carretel; para corrigir, adicione \"hexOverride\" (é preservado na próxima sincronização).",
  lines: LINES.map(({ slug, ...l }) => ({ ...l, url: `${BASE}/pla/${slug}/` })),
  filaments,
};
fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
console.log(`\n${filaments.length} filamentos → ${path.relative(ROOT, OUT)}`);
