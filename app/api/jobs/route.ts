import { handle } from "@/lib/api";
import { createJobs } from "@/lib/jobs";

export const POST = (req: Request) =>
  handle(async () => {
    const { product, request } = await req.json();
    return { jobIds: createJobs(product, request) };
  });
