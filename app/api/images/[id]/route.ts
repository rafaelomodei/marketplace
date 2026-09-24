import { handle } from "@/lib/api";
import { reframe } from "@/lib/jobs";
import { approveImage, deleteImage, HttpError, setCandidateStatus } from "@/lib/products";

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => {
    const id = Number((await params).id);
    const { action, aspect } = await req.json();
    switch (action) {
      case "approve":
        return { approvedId: approveImage(id) };
      case "reject":
        return setCandidateStatus(id, "rejected");
      case "reset":
        return setCandidateStatus(id, "pending");
      case "reframe":
        return { jobIds: reframe(id, aspect) };
      default:
        throw new HttpError(400, `Ação desconhecida: ${action}`);
    }
  });

export const DELETE = (_req: Request, { params }: Ctx) => handle(async () => deleteImage(Number((await params).id)));
