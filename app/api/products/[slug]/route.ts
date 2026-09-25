import { handle } from "@/lib/api";
import { getProductAction, runAction, updateProductAction } from "@/lib/actions";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export const GET = (_req: Request, { params }: Ctx) => handle(async () => runAction(getProductAction, { slug: (await params).slug }));

export const PATCH = (req: Request, { params }: Ctx) =>
  handle(async () => runAction(updateProductAction, { ...(await req.json()), slug: (await params).slug }));
