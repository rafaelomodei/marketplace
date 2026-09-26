import { handle } from "@/lib/api";
import { duplicateLabCreationAction, runAction } from "@/lib/actions";

type Ctx = { params: Promise<{ id: string }> };

export const POST = (_req: Request, { params }: Ctx) => handle(async () => runAction(duplicateLabCreationAction, { id: (await params).id }));
