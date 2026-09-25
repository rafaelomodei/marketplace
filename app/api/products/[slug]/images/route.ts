import { handle } from "@/lib/api";
import { addImagesAction, runAction } from "@/lib/actions";

type Ctx = { params: Promise<{ slug: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { slug } = await params;
    const form = await req.formData();
    const files = [];
    for (const file of form.getAll("files"))
      if (file instanceof File) files.push({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    return runAction(addImagesAction, { slug, kind: form.get("kind"), files });
  });
