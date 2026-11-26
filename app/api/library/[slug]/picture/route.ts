import sharp from "sharp";
import { filePicture } from "@/lib/library";
import { HttpError } from "@/lib/products";

type Ctx = { params: Promise<{ slug: string }> };

/** Picture of a plate of a 3MF (or a render of an STL): `?file=fatiados/x.3mf&plate=2&w=480`. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const q = new URL(req.url).searchParams;
    const png = await filePicture(slug, q.get("file") ?? "", Number(q.get("plate")) || 1);
    const width = Math.min(1600, Number(q.get("w")) || 0);
    const body = width ? await sharp(png).resize({ width, withoutEnlargement: true }).png().toBuffer() : png;
    return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" } });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error("[library] picture", err);
    return new Response(err instanceof Error ? err.message : "error", { status });
  }
}
