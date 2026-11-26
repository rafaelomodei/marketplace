import { handle } from "@/lib/api";
import { addLibraryFilesAction, runAction } from "@/lib/actions";

type Ctx = { params: Promise<{ slug: string }> };

/** Multipart upload of STL/3MF files (big files would not fit in a JSON body). */
export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { slug } = await params;
    const form = await req.formData();
    const files = [];
    for (const file of form.getAll("files"))
      if (file instanceof File) files.push({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    return runAction(addLibraryFilesAction, { project: slug, folder: form.get("folder") || undefined, files });
  });
