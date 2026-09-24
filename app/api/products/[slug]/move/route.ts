import { handle } from "@/lib/api";
import { HttpError, moveProduct } from "@/lib/products";

type Ctx = { params: Promise<{ slug: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { stage } = await req.json();
    if (stage !== "create" && stage !== "ready") throw new HttpError(400, "stage inválido");
    moveProduct((await params).slug, stage);
  });
