import { handle } from "@/lib/api";
import { getCatalogAction, runAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => runAction(getCatalogAction, {}));
