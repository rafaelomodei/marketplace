import { handle } from "@/lib/api";
import { getCatalogAction, runAction, updateCodexSettingsAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => runAction(getCatalogAction, {}));

export const PATCH = (req: Request) => handle(async () => runAction(updateCodexSettingsAction, await req.json()));
