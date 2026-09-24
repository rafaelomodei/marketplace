import { handle } from "@/lib/api";
import { cancelJob, getJob, retryJob } from "@/lib/jobs";
import { HttpError } from "@/lib/products";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) => handle(async () => getJob((await params).id));

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const id = (await params).id;
    const { action } = await req.json();
    if (action === "cancel") return cancelJob(id);
    if (action === "retry") return { jobIds: retryJob(id) };
    throw new HttpError(400, `Ação desconhecida: ${action}`);
  });
