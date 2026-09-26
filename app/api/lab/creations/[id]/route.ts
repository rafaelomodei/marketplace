import { handle } from "@/lib/api";
import { deleteLabCreationAction, getLabCreationAction, renameLabCreationAction, runAction, saveLabCreationAction } from "@/lib/actions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) => handle(async () => runAction(getLabCreationAction, { id: (await params).id }));

/** `keepalive` saves (leaving the editor) arrive here too. */
export const PUT = (req: Request, { params }: Ctx) =>
  handle(async () => runAction(saveLabCreationAction, { ...(await req.json()), id: (await params).id }));

/** Rename: `{ name }` (empty = automatic name). */
export const PATCH = (req: Request, { params }: Ctx) =>
  handle(async () => runAction(renameLabCreationAction, { ...(await req.json()), id: (await params).id }));

export const DELETE = (_req: Request, { params }: Ctx) => handle(async () => runAction(deleteLabCreationAction, { id: (await params).id }));
