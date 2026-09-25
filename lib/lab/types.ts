import type { Param, ParamValues } from "./params";

/** A printable piece of the model, rendered separately so it can be printed in its own color. */
export type ToolPart = { id: string; label: string; defaultColor: string };

/** A ready-made starting point ("Profissão e nome"): values and colors that replace the defaults. */
export type ToolFile = { id: string; label: string; parts: string[] };

export type ToolPreset = { id: string; label: string; values: ParamValues; colors?: Record<string, string> };

export type LabTool = {
  /** URL segment and action id: /lab/<id>. */
  id: string;
  name: string;
  /** One line for the gallery card. */
  tagline: string;
  status: "ready" | "soon";
  /** Tags for the gallery card (e.g. "2 cores", "Sem suporte"). */
  tags: string[];
  /** Picture for the gallery card (public/lab/previews/…). */
  preview?: string;
  /** Everything below is only needed for tools that are ready. */
  source?: string;
  params?: Param[];
  parts?: ToolPart[];
  /** Parts that exist with these values (e.g. no "top" part without a top text). Default: all. */
  activeParts?: (values: ParamValues) => string[];
  /** Values sent to OpenSCAD, when they differ from the form (e.g. icon id → codepoint). */
  toScad?: (values: ParamValues) => ParamValues;
  presets?: ToolPreset[];
  /** Files offered for download; each one merges some rendered parts into one STL. Default: one per part. */
  files?: (values: ParamValues, parts: string[]) => ToolFile[];
  /** Whether the multi-color 3MF makes sense with these values (default: yes). */
  multicolor?: (values: ParamValues) => boolean;
  /** Form section after which the colors are shown (default: the first one). */
  colorsAfterGroup?: string;
  /** Plain-language problem with the values, or null if they can be printed. */
  validate?: (values: ParamValues) => string | null;
  /** File name without extension, e.g. chaveiro-amalia. */
  fileName?: (values: ParamValues) => string;
  /** Tips shown next to the downloads. */
  printTips?: string[];
};
