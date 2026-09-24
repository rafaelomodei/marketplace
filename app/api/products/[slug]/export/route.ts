import { handle } from "@/lib/api";
import { exportImages } from "@/lib/export";

export const POST = (req: Request) =>
  handle(async () => {
    const { imageIds, marketplace, targetIds, mode } = await req.json();
    return { created: await exportImages({ imageIds, marketplace, targetIds, mode }) };
  });
