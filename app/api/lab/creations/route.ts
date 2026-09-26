import { handle } from "@/lib/api";
import { listLabCreationsAction, runAction, saveLabCreationAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => handle(() => runAction(listLabCreationsAction, { tool: new URL(req.url).searchParams.get("tool") ?? undefined }));

export const POST = (req: Request) => handle(async () => runAction(saveLabCreationAction, await req.json()));
