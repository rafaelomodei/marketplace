import { creationThumbnail } from "@/lib/lab/creations";

type Ctx = { params: Promise<{ id: string }> };

const type = (b: Buffer) => (b[0] === 0x89 ? "image/png" : b[0] === 0xff ? "image/jpeg" : "image/webp");

/** Picture of a saved Lab creation (the editor sends it when saving). */
export async function GET(_req: Request, { params }: Ctx) {
  const bytes = creationThumbnail((await params).id);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type(bytes), "Cache-Control": "no-cache" } });
}
