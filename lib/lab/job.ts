import { findFont, LAB_ICON_FONT } from "./fonts";
import { isSet, type ParamValues } from "./params";
import type { LabTool } from "./types";

/**
 * What to render for a tool with some values: the OpenSCAD values, the font files it needs and the parts that exist.
 * Shared by the browser worker and the server so both render exactly the same model.
 */
export function labJob(tool: LabTool, values: ParamValues) {
  const params = tool.params ?? [];
  const fontFiles = new Set<string>();
  for (const p of params) {
    if (p.type === "font") fontFiles.add(findFont(String(values[p.id])).file);
    if (p.type === "icon" && isSet(values[p.id])) fontFiles.add(LAB_ICON_FONT.file);
  }
  const all = (tool.parts ?? []).map((p) => p.id);
  const active = tool.activeParts?.(values);
  return {
    scadValues: tool.toScad?.(values) ?? values,
    fontFiles: [...fontFiles],
    parts: active ? all.filter((id) => active.includes(id)) : all,
  };
}
