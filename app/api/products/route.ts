import { handle } from "@/lib/api";
import { createProductAction, listProductsAction, runAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => runAction(listProductsAction, {}));

export const POST = (req: Request) => handle(async () => runAction(createProductAction, await req.json()));
