import type { Param, ParamValues } from "./params";

/** A printable piece of the model, rendered separately so it can be printed in its own color. */
export type ToolPart = {
  id: string;
  label: string;
  defaultColor: string;
  /** Its color is picked inside this param's control (e.g. the SVG editor), not in the "Cores" section. */
  param?: string;
  /** Only shown in the 3D preview (e.g. a virtual paper clip), with a button to hide it; never downloaded. */
  preview?: boolean;
};

/** A one-click way out of a problem (e.g. "Aumentar a peça para 36 mm"): the values to change. */
export type ToolFix = { label: string; values: ParamValues };

/**
 * Drawing over the 2D editor, in mm (y up): a cut to show or the outline of a preview part.
 * `drag`: grabbing it moves that draggable part (see LabTool.drags).
 */
export type ToolGuide = { d: string; kind: "cut" | "ghost"; width?: number; part?: string; drag?: string; box: [number, number, number, number] };

/**
 * A preview part people move by dragging it in the editor (3D and from above), instead of typing numbers: moving it
 * sideways changes the number param `x`, up/down (in the drawing) changes `y`, 1 mm per mm. Never up from the table (Z).
 */
export type ToolDrag = { part: string; x?: string; y?: string; /** Shown in the editor's tips. */ hint?: string };

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
  /** Fixed, or depending on the values (e.g. one per color of an uploaded drawing). */
  parts?: ToolPart[] | ((values: ParamValues) => ToolPart[]);
  /** OpenSCAD code generated from the values, pasted before the source (e.g. the shapes of an SVG). */
  prelude?: (values: ParamValues) => string;
  /** Guides drawn over the 2D editor. */
  guides?: (values: ParamValues) => ToolGuide[];
  /** Preview parts that can be dragged to change params (e.g. the clip: position and depth of the slot). */
  drags?: ToolDrag[];
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
  /** When there is a problem: changes that solve it, offered as buttons next to it. */
  fixes?: (values: ParamValues) => ToolFix[];
  /** File name without extension, e.g. chaveiro-amalia. */
  fileName?: (values: ParamValues) => string;
  /** Tips shown next to the downloads. */
  printTips?: string[];
  /** How to photograph it for the marketplace ("Gerar mockup"): see LabMockup. */
  mockup?: LabMockup;
};

/**
 * What a tool tells the Studio when one of its pieces becomes a product: whether the preview parts (e.g. the clip) show
 * in the 3D pictures, what the AI must know about them, and ideas of scenes where the piece is used.
 */
export type LabMockup = { previews?: boolean; notes?: string; scenes?: string[] };
