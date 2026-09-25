import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "@/lib/paths";

type Ctx = { params: Promise<{ path: string[] }> };
const BASE = path.join(ROOT, "assets", "filaments");

/** Serves the downloaded filament photos; `?w=160` returns a resized JPEG. */
export async function GET(req: Request, { params }: Ctx) {
  const rel = (await params).path.map(decodeURIComponent).join("/");
  const abs = path.resolve(BASE, rel);
  if (!abs.startsWith(BASE + path.sep) || !fs.existsSync(abs)) return new Response("not found", { status: 404 });
  const width = Number(new URL(req.url).searchParams.get("w")) || 0;
  const body = width ? await sharp(abs).resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer() : fs.readFileSync(abs);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "max-age=86400" } });
}
