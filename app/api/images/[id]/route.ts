import { handle } from "@/lib/api";
import { deleteImageAction, reframeImageAction, reviewImageAction, runAction } from "@/lib/actions";
import { HttpError } from "@/lib/products";

type Ctx = { params: Promise<{ id: string }> };
const DECISION = { approve: "approve", reject: "reject", reset: "reset" } as const;

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const imageId = Number((await params).id);
    const { action, aspect } = await req.json();
    if (action === "reframe") return runAction(reframeImageAction, { imageId, aspect });
    const decision = DECISION[action as keyof typeof DECISION];
    if (!decision) throw new HttpError(400, `Ação desconhecida: ${action}`);
    return runAction(reviewImageAction, { imageId, decision });
  });

export const DELETE = (_req: Request, { params }: Ctx) =>
  handle(async () => runAction(deleteImageAction, { imageId: Number((await params).id) }));
