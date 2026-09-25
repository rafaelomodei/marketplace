import { handle } from "@/lib/api";
import { moveProductAction, runAction } from "@/lib/actions";

type Ctx = { params: Promise<{ slug: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => runAction(moveProductAction, { slug: (await params).slug, stage: (await req.json()).stage }));
