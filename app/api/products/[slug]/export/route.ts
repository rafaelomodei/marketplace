import { handle } from "@/lib/api";
import { exportImagesAction, runAction } from "@/lib/actions";

export const POST = (req: Request) => handle(async () => runAction(exportImagesAction, await req.json()));
