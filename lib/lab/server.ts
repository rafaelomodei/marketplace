import fs from "node:fs";
import path from "node:path";
import { HttpError } from "../products";
import { ROOT } from "../paths";
import { renderParts } from "./engine";
import { labJob, toolParts } from "./job";
import { build3mf, buildStl, dimensions, bounds, parseStl } from "./mesh";
import { defaultValues, paramsSchema, type ParamValues } from "./params";
import { findTool } from "./tools";
import type { LabTool } from "./types";

/** Server-side Lab rendering (actions / future MCP tools). The browser uses the Web Worker instead. */
export function requireTool(id: string): LabTool & Required<Pick<LabTool, "source" | "params" | "parts">> {
  const tool = findTool(id);
  if (!tool || tool.status !== "ready" || !tool.source || !tool.params || !tool.parts)
    throw new HttpError(404, `Ferramenta não disponível: ${id}`);
  return tool as never;
}

/**
 * Renders a tool with some values. `preview` also renders the preview-only parts (e.g. the virtual clip), returned
 * apart in `previews` — they never go into the files.
 */
export async function renderTool(id: string, input: Record<string, unknown>, { preview = false } = {}) {
  const tool = requireTool(id);
  const parsed = paramsSchema(tool.params).safeParse(input);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const values = { ...defaultValues(tool.params), ...parsed.data } as ParamValues;
  const problem = tool.validate?.(values);
  if (problem) throw new HttpError(400, problem);

  const job = labJob(tool, values, { preview });
  const fonts = job.fontFiles.map((file) => ({ file, data: new Uint8Array(fs.readFileSync(path.join(ROOT, "public", "lab", "fonts", file))) }));
  const { parts, ms } = await renderParts({ source: job.source, values: job.scadValues, fonts, parts: job.parts });
  const rendered = toolParts(tool, values).filter((p) => parts[p.id]);
  const soups = rendered.filter((p) => !p.preview).map((p) => ({ id: p.id, name: p.label, color: p.defaultColor, soup: parseStl(parts[p.id]) }));
  const previews = rendered.filter((p) => p.preview).map((p) => ({ id: p.id, name: p.label, color: p.defaultColor, soup: parseStl(parts[p.id]) }));
  const box = bounds(soups.map((s) => s.soup));
  // Printable files, as the tool groups them (e.g. a base with pockets + separate pieces).
  const printed = soups.map((p) => p.id);
  const fileName = tool.fileName?.(values) ?? tool.id;
  const files = (tool.files?.(values, printed) ?? printed.map((id) => ({ id, label: id, parts: [id] }))).map((f) => ({
    name: `${fileName}-${f.id}.stl`,
    label: f.label,
    data: f.parts.length === 1 ? parts[f.parts[0]] : buildStl(f.parts.map((id) => parseStl(parts[id]))),
  }));
  const multicolor = tool.multicolor?.(values) ?? true;
  return { tool, values, parts, soups, previews, ms, size: box ? dimensions(box) : null, files, file3mf: multicolor ? build3mf(soups) : null };
}
