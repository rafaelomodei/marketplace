import { handle } from "@/lib/api";
import { runAction, sendLabCreationToStudioAction } from "@/lib/actions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = (_req: Request, { params }: Ctx) => handle(async () => runAction(sendLabCreationToStudioAction, { id: (await params).id }));
