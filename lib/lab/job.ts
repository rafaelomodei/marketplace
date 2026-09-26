import { findFont, LAB_ICON_FONT } from "./fonts";
import { isSet, type ParamValues } from "./params";
import type { LabTool, ToolPart } from "./types";

/** The tool's parts for these values (some tools have one part per color of the drawing). */
export const toolParts = (tool: LabTool, values: ParamValues): ToolPart[] =>
  (typeof tool.parts === "function" ? tool.parts(values) : tool.parts) ?? [];

/**
 * What to render for a tool with some values: the OpenSCAD source and values, the font files it needs and the
 * parts that exist. Shared by the browser worker and the server so both render exactly the same model.
 * `preview` adds the parts that only exist in the 3D preview (never in downloads; the server renders them for pictures).
 */
export function labJob(tool: LabTool, values: ParamValues, { preview = false } = {}) {
  const params = tool.params ?? [];
  const fontFiles = new Set<string>();
  for (const p of params) {
    if (p.type === "font") fontFiles.add(findFont(String(values[p.id])).file);
    if (p.type === "icon" && isSet(values[p.id])) fontFiles.add(LAB_ICON_FONT.file);
  }
  const all = toolParts(tool, values).filter((p) => preview || !p.preview);
  const active = tool.activeParts?.(values);
  return {
    source: tool.prelude ? `${tool.prelude(values)}\n${tool.source ?? ""}` : (tool.source ?? ""),
    scadValues: tool.toScad?.(values) ?? values,
    fontFiles: [...fontFiles],
    parts: all.filter((p) => !active || active.includes(p.id) || p.preview).map((p) => p.id),
  };
}
