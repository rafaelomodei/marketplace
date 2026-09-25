import { handle } from "@/lib/api";
import { callAction } from "@/lib/actions";

type Ctx = { params: Promise<{ name: string }> };

/** Generic entry point: POST the action input as JSON, like an MCP `tools/call`. */
export const POST = (req: Request, { params }: Ctx) =>
  handle(async () => callAction((await params).name, await req.json().catch(() => ({}))));
