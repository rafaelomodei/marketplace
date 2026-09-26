import { slugify } from "@/lib/text";
import type { Param, ParamValues } from "../../params";
import { artOf, designLayers, designScad, layoutDesign, MAX_SHAPES, readDesign, writeDesign, type SvgDesign, type SvgLayout } from "../../svg";
import type { LabTool, ToolPart } from "../../types";

/**
 * Everything the "drawing in colored layers" tools share (enfeite de clipe…): the SVG editor param, size and
 * base params, one part per color, the OpenSCAD code of the drawing and its checks. Pairs with
 * lib/lab/scad/svg-relief.scad; a tool adds its own part (a clip slot, a ring…).
 */

/** Id of the SVG editor param; the editor also reads `width` and `border`. */
export const DESIGN = "design";

export const designOf = (v: ParamValues): SvgDesign | null => readDesign(v[DESIGN]);

/** The drawing laid out at the chosen width, or the problem in plain language. */
export function reliefLayout(v: ParamValues): { layout: SvgLayout; error?: undefined } | { layout?: undefined; error: string } {
  const d = designOf(v);
  if (!d) return { error: "Envie um desenho em SVG." };
  try {
    return { layout: layoutDesign(d, Number(v.width)) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Base (and contour) + one part per visible color of the drawing, largest first. */
export function reliefParts(base: { label: string; color: string }, v: ParamValues): ToolPart[] {
  const d = designOf(v);
  let layers: ReturnType<typeof designLayers> = [];
  try {
    layers = d ? designLayers(artOf(d.svg), d).filter((l) => !l.hidden && l.shapes > 0) : [];
  } catch {
    layers = [];
  }
  return [
    { id: "base", label: base.label, defaultColor: base.color },
    ...layers.map((l) => ({ id: l.id, label: `Cor ${l.index + 1}`, defaultColor: l.hex, param: DESIGN })),
  ];
}

export function reliefHooks(base: { label: string; color: string }): Pick<LabTool, "parts" | "activeParts" | "toScad" | "prelude"> {
  return {
    parts: (v) => reliefParts(base, v),
    // A color with no relief and no inlay has no volume of its own: it is just the base.
    activeParts: (v) => {
      const heights = new Map(reliefLayout(v).layout?.layers.map((l) => [l.id, l.maxHeight]));
      return reliefParts(base, v)
        .filter((p) => !p.param || Number(v.inlay) > 0 || (heights.get(p.id) ?? 0) > 0)
        .map((p) => p.id);
    },
    toScad: ({ [DESIGN]: _design, ...v }) => v,
    prelude: (v) => {
      const r = reliefLayout(v);
      return r.layout ? designScad(r.layout) : "";
    },
  };
}

/** Params in form order: drawing → size → [tool] → advanced. */
export function reliefParams(o: { design: SvgDesign; width: number; minWidth: number; maxWidth: number }) {
  const drawing: Param[] = [
    {
      id: DESIGN,
      type: "svg",
      group: "Desenho",
      label: "Seu desenho",
      hint: "Envie um SVG. Cada cor do desenho vira uma peça: escolha o filamento e a altura de cada uma.",
      default: writeDesign(o.design),
    },
  ];
  const size: Param[] = [
    { id: "width", type: "number", group: "Tamanho", label: "Largura da peça", default: o.width, min: o.minWidth, max: o.maxWidth, step: 1, unit: "mm" },
    { id: "base_thickness", type: "number", group: "Tamanho", label: "Espessura da base", default: 3, min: 1.2, max: 8, step: 0.2, unit: "mm" },
  ];
  const advanced: Param[] = [
    {
      id: "border",
      type: "number",
      group: "Contorno",
      label: "Borda em volta do desenho",
      hint: "Uma margem da cor da base em volta de tudo; também fecha frestas pequenas entre as formas.",
      default: 1,
      min: 0,
      max: 5,
      step: 0.2,
      unit: "mm",
      advanced: true,
    },
    {
      id: "inlay",
      type: "number",
      group: "Contorno",
      label: "Cor embutida na base",
      hint: "Quanto cada cor entra na base. Com 0, as cores só aparecem onde têm relevo.",
      default: 0.6,
      min: 0,
      max: 2,
      step: 0.2,
      unit: "mm",
      advanced: true,
    },
  ];
  return { drawing, size, advanced };
}

/** Problems shared by every relief tool (a tool adds its own checks). */
export function validateRelief(v: ParamValues): string | null {
  const r = reliefLayout(v);
  if (!r.layout) return r.error;
  if (r.layout.shapes.length > MAX_SHAPES)
    return `O desenho tem ${r.layout.shapes.length} formas — o máximo é ${MAX_SHAPES}. Simplifique o SVG ou esconda as cores que não precisa.`;
  if (Number(v.inlay) >= Number(v.base_thickness) - 0.4) return "A cor está entrando fundo demais na base: deixe pelo menos 0,4 mm de base por baixo.";
  return null;
}

export const reliefFileName = (prefix: string) => (v: ParamValues) => `${prefix}-${slugify(designOf(v)?.name ?? "") || "desenho"}`;
