import { z } from "zod";

/**
 * Codex `--output-schema` uses OpenAI strict structured outputs: every property must be listed in
 * `required`, objects must close `additionalProperties`, and optional data is expressed as `null`.
 * This converts a zod schema (with ordinary `.optional()` fields) into that dialect.
 */
export function codexOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  return strict(json);
}

// Keywords strict mode rejects or that only matter to our own zod validation afterwards.
const DROP = new Set(["default", "minLength", "maxLength", "propertyNames", "$schema"]);

function nullable(node: Record<string, any>): Record<string, any> {
  if (typeof node.type === "string") {
    const next: Record<string, any> = { ...node, type: [node.type, "null"] };
    if (Array.isArray(node.enum)) next.enum = [...node.enum, null];
    if ("const" in node) { next.enum = [node.const, null]; delete next.const; }
    return next;
  }
  return { anyOf: [node, { type: "null" }] };
}

function strict(node: unknown): any {
  if (Array.isArray(node)) return node.map(strict);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) if (!DROP.has(key)) out[key] = strict(value);
  if (out.type === "object") {
    if (out.additionalProperties && typeof out.additionalProperties === "object") throw new Error("Saída estruturada do Codex não aceita registros livres (z.record); use uma lista de pares");
    const properties: Record<string, any> = out.properties ?? {};
    const required = new Set<string>(Array.isArray(out.required) ? out.required : []);
    out.properties = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, required.has(key) ? value : nullable(value)]));
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  }
  return out;
}

/** Removes `null` (strict-mode "absent") and empty strings so zod sees a missing value. */
export function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripEmpty).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = stripEmpty(item);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  if (value === null || (typeof value === "string" && !value.trim())) return undefined;
  return value;
}

function removeAt(root: unknown, path: PropertyKey[]) {
  let parent: any = root;
  for (const key of path.slice(0, -1)) { parent = parent?.[key as any]; if (parent == null) return false; }
  const last = path[path.length - 1] as any;
  if (parent == null || !(last in Object(parent))) return false;
  if (Array.isArray(parent)) parent.splice(Number(last), 1); else delete parent[last];
  return true;
}

/**
 * Parses Codex JSON keeping everything valid: an invalid field is dropped instead of discarding the
 * whole answer, since a partial suggestion is still useful to the seller.
 */
export function parseCodexOutput<S extends z.ZodType>(schema: S, text: string): z.output<S> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("o Codex não devolveu um JSON válido"); }
  value = stripEmpty(value) ?? {};
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    // One issue per round (array indexes shift on removal). A missing required key drops its parent.
    let path = [...result.error.issues[0].path];
    while (path.length && !removeAt(value, path)) path = path.slice(0, -1);
    if (!path.length) throw new Error(result.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`).join("; "));
  }
  throw new Error("saída do Codex com campos inválidos demais");
}
