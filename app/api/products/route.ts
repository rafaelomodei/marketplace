import { handle } from "@/lib/api";
import { createProduct, listProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => listProducts());

export const POST = (req: Request) =>
  handle(async () => {
    const body = await req.json();
    return { slug: createProduct(String(body.name ?? "").trim(), body.meta ?? {}) };
  });
