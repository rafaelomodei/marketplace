import { handle } from "@/lib/api";
import { getProduct, writeMeta } from "@/lib/products";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export const GET = (_req: Request, { params }: Ctx) => handle(async () => getProduct((await params).slug));

export const PATCH = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const { name, description, fidelityNotes, marketplaces } = await req.json();
    return writeMeta((await params).slug, { name, description, fidelityNotes, marketplaces });
  });
