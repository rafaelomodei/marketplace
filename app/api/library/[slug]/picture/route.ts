import sharp from "sharp";
import { filePicture, projectImageFile } from "@/lib/library";
import { HttpError } from "@/lib/products";
import { jpegThumb } from "@/lib/thumbs";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * A picture of a project: a plate of a 3MF (or a render of an STL), `?file=fatiados/x.3mf&plate=2&w=480`, or a photo /
 * approved image of its studio product, `?image=real/foto.jpg&w=320` (the cover can be either).
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const q = new URL(req.url).searchParams;
    const width = Math.min(1600, Number(q.get("w")) || 0);
    const headers = { "Cache-Control": "no-cache" };
    const image = q.get("image");
    if (image) {
      const jpeg = await jpegThumb(projectImageFile(slug, image), width || 1600);
      return new Response(new Uint8Array(jpeg), { headers: { ...headers, "Content-Type": "image/jpeg" } });
    }
    const png = await filePicture(slug, q.get("file") ?? "", Number(q.get("plate")) || 1);
    const body = width ? await sharp(png).resize({ width, withoutEnlargement: true }).png().toBuffer() : png;
    return new Response(new Uint8Array(body), { headers: { ...headers, "Content-Type": "image/png" } });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error("[library] picture", err);
    return new Response(err instanceof Error ? err.message : "error", { status });
  }
}
