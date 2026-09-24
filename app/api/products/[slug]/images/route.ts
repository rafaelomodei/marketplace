import { handle } from "@/lib/api";
import { HttpError, saveUpload } from "@/lib/products";

type Ctx = { params: Promise<{ slug: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { slug } = await params;
    const form = await req.formData();
    const kind = form.get("kind");
    if (kind !== "real" && kind !== "style") throw new HttpError(400, "kind deve ser real ou style");
    const saved: string[] = [];
    for (const file of form.getAll("files"))
      if (file instanceof File) saved.push(saveUpload(slug, kind, file.name, Buffer.from(await file.arrayBuffer())));
    return { saved };
  });
