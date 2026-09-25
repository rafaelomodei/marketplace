import { handle } from "@/lib/api";
import { generateImagesAction, runAction } from "@/lib/actions";

export const POST = (req: Request) =>
  handle(async () => {
    const { product, request } = await req.json();
    return runAction(generateImagesAction, { slug: product, request });
  });
