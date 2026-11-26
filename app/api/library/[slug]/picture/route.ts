import { filePicture } from "@/lib/library";
import { HttpError } from "@/lib/products";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Picture of a plate of a 3MF (or a render of an STL): `?file=fatiados/x.3mf&plate=2&w=480&v=<version>`.
 * Made once and kept on disk by the library; with `v` (the file version) the browser may keep it for good too.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const q = new URL(req.url).searchParams;
    const png = await filePicture(slug, q.get("file") ?? "", Number(q.get("plate")) || 1, Number(q.get("w")) || 0);
    const cache = q.get("v") ? "private, max-age=31536000, immutable" : "no-cache";
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": cache } });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error("[library] picture", err);
    return new Response(err instanceof Error ? err.message : "error", { status });
  }
}
