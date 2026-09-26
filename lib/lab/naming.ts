import type { ParamValues } from "./params";
import { readDesign } from "./svg/design";
import type { LabTool } from "./types";

/**
 * Automatic name of a creation, until someone renames it: the first text typed (e.g. the name on the keychain),
 * the drawing's name, or the tool's. Pure, so the editor shows it live.
 */
export function creationName(tool: LabTool, values: ParamValues): string {
  for (const p of tool.params ?? []) {
    const v = values[p.id];
    if (p.type === "text" && String(v ?? "").trim()) return String(v).trim();
    if (p.type === "svg") {
      const name = readDesign(v)?.name?.replace(/\.svg$/i, "").trim();
      if (name) return name;
    }
  }
  return tool.name;
}

export const MAX_CREATION_NAME = 80;
