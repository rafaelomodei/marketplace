import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR } from "@/lib/paths";
import { HttpError, productFile } from "@/lib/products";

type Ctx = { params: Promise<{ slug: string; rel: string[] }> };

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** Serves product images; `?w=400` returns a cached JPEG thumbnail. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { slug, rel } = await params;
    const abs = productFile(slug, rel.map(decodeURIComponent).join("/"));
    if (!fs.existsSync(abs)) throw new HttpError(404, "not found");
    const width = Number(new URL(req.url).searchParams.get("w")) || 0;
    const headers = { "Cache-Control": "no-cache" };

    if (!width) {
      const type = TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
      return new Response(new Uint8Array(fs.readFileSync(abs)), { headers: { ...headers, "Content-Type": type } });
    }
    const key = crypto.createHash("sha1").update(`${abs}:${fs.statSync(abs).mtimeMs}:${width}`).digest("hex");
    const thumb = path.join(DATA_DIR, "thumbs", `${key}.jpg`);
    if (!fs.existsSync(thumb)) {
      fs.mkdirSync(path.dirname(thumb), { recursive: true });
      await sharp(abs).rotate().flatten({ background: "#ffffff" }).resize({ width, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumb);
    }
    return new Response(new Uint8Array(fs.readFileSync(thumb)), { headers: { ...headers, "Content-Type": "image/jpeg" } });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return new Response(err instanceof Error ? err.message : "error", { status });
  }
}
