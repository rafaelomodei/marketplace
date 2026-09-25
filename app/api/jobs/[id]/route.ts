import { handle } from "@/lib/api";
import { cancelJobAction, getJobAction, retryJobAction, runAction } from "@/lib/actions";
import { HttpError } from "@/lib/products";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) => handle(async () => runAction(getJobAction, { jobId: (await params).id }));

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const jobId = (await params).id;
    const { action } = await req.json();
    if (action === "cancel") return runAction(cancelJobAction, { jobId });
    if (action === "retry") return runAction(retryJobAction, { jobId });
    throw new HttpError(400, `Ação desconhecida: ${action}`);
  });
