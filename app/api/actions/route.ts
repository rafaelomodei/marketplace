import { handle } from "@/lib/api";
import { listActions } from "@/lib/actions";

export const dynamic = "force-dynamic";

/** Catalog of every studio action with its JSON Schema — the same list an MCP `tools/list` will return. */
export const GET = () => handle(() => ({ actions: listActions() }));
