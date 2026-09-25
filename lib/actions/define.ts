import { z } from "zod";
import { HttpError } from "../products";

/**
 * One operation of the studio, described once and reused by every entry point:
 * the Next.js API routes today, and an MCP server (one tool per action) later.
 */
export type Action<I extends z.ZodType = z.ZodType, O = unknown> = {
  /** snake_case, stable: becomes the MCP tool name. */
  name: string;
  title: string;
  /** Written for an LLM choosing a tool: what it does and when to use it. */
  description: string;
  input: I;
  /** true when the action does not change anything (MCP `readOnlyHint`). */
  readOnly?: boolean;
  run: (input: z.infer<I>) => O | Promise<O>;
};

export const defineAction = <I extends z.ZodType, O>(action: Action<I, O>) => action;

/** Validates raw input against the action's schema, then runs it. Bad input becomes a 400. */
export async function runAction<I extends z.ZodType, O>(action: Action<I, O>, raw: unknown): Promise<O> {
  const parsed = action.input.safeParse(raw ?? {});
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  return action.run(parsed.data);
}

/** Public description of an action (name + JSON Schema of the input), as an MCP `tools/list` entry. */
export function describeAction(action: Action) {
  return {
    name: action.name,
    title: action.title,
    description: action.description,
    inputSchema: z.toJSONSchema(action.input, { unrepresentable: "any" }),
    annotations: { readOnlyHint: action.readOnly ?? false },
  };
}
