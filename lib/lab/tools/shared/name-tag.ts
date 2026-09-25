import { slugify } from "@/lib/text";
import { findIcon } from "../../fonts";
import { isSet, listValue, type Param, type ParamValues } from "../../params";
import type { LabTool, ToolFile, ToolPart } from "../../types";

/**
 * Everything the "name on a contour base" tools share (chaveiro, etiqueta de bolsa…): params, parts,
 * single-color fit pieces and downloads. Pairs with lib/lab/scad/name-tag.scad.
 */

export const SINGLE = { param: "print_mode", equals: "single" };
const PIECES = ["text", "top", "icon"];

/** Parts printed on their own (single-color printing): the chosen ones that exist with these values. */
export const separated = (v: ParamValues) =>
  v.print_mode === "single" ? listValue(v.separate).filter((p) => PIECES.includes(p) && (p === "text" || isSet(p === "top" ? v.top_text : v.icon))) : [];

export const nameTagParts = (base: { label: string; color: string }, textColor: string): ToolPart[] => [
  { id: "base", label: base.label, defaultColor: base.color },
  { id: "text", label: "Nome", defaultColor: textColor },
  { id: "top", label: "Texto de cima", defaultColor: "#C9AE85" },
  { id: "icon", label: "Ícone", defaultColor: "#F06292" },
];

/** The LabTool hooks for any name-tag tool; `extra` lets a tool drop its own form-only values before OpenSCAD. */
export function nameTagHooks(parts: ToolPart[]): Pick<LabTool, "activeParts" | "toScad" | "multicolor" | "files" | "colorsAfterGroup"> {
  const label = (id: string) => parts.find((p) => p.id === id)!.label;
  return {
    activeParts: (v) => ["base", "text", ...(isSet(v.top_text) ? ["top"] : []), ...(isSet(v.icon) ? ["icon"] : [])],
    toScad: (values) => {
      const { icon, print_mode: _mode, separate: _separate, ...v } = values;
      const sep = separated(values);
      return {
        ...v,
        icon_code: findIcon(String(icon))?.code ?? 0,
        sep_text: sep.includes("text") ? 1 : 0,
        sep_top: sep.includes("top") ? 1 : 0,
        sep_icon: sep.includes("icon") ? 1 : 0,
      };
    },
    multicolor: (v) => v.print_mode !== "single",
    files: (v, rendered): ToolFile[] => {
      if (v.print_mode !== "single") return rendered.map((id) => ({ id, label: label(id), parts: [id] }));
      const sep = separated(v).filter((id) => rendered.includes(id));
      // The base carries every part that is not printed separately (change filament with a pause).
      const fused = rendered.filter((id) => id !== "base" && !sep.includes(id));
      return [
        { id: "base", label: sep.length ? `${label("base")} com encaixes` : label("base"), parts: ["base", ...fused] },
        ...sep.map((id) => ({ id, label: `${label(id)} (peça de encaixe)`, parts: [id] })),
      ];
    },
    colorsAfterGroup: "Ícone",
  };
}

const ALIGN = [
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
];

/**
 * Params in form order, split so a tool can put its own sections (Argola, Alça) between them:
 * content (Nome, Texto de cima, Ícone) → size → [tool] → print → advanced.
 */
export function nameTagParams(o: { textLabel: string; text: string; font: string; topHint: string; printMode: "multi" | "single" }) {
  const content: Param[] = [
    { id: "text", type: "text", group: "Nome", label: o.textLabel, default: o.text, maxLength: 30, placeholder: "Digite um nome" },
    { id: "font", type: "font", group: "Nome", label: "Fonte do nome", default: o.font },
    { id: "top_text", type: "text", group: "Texto de cima", label: "Texto", hint: o.topHint, default: "", maxLength: 30, placeholder: "Ex.: Professora" },
    { id: "top_font", type: "font", group: "Texto de cima", label: "Fonte", default: "Satisfy", showIf: "top_text" },
    { id: "top_align", type: "choice", group: "Texto de cima", label: "Alinhamento", default: "center", options: ALIGN, showIf: "top_text" },
    { id: "icon", type: "icon", group: "Ícone", label: "Escolha um ícone (opcional)", default: "none" },
    {
      id: "icon_position",
      type: "choice",
      group: "Ícone",
      label: "Posição",
      default: "after",
      options: [
        { value: "before", label: "Antes do nome" },
        { value: "after", label: "Depois do nome" },
      ],
      showIf: "icon",
    },
  ];
  const size: Param[] = [{ id: "text_size", type: "number", group: "Tamanho", label: "Altura do nome", default: 14, min: 6, max: 40, step: 0.5, unit: "mm" }];
  const print: Param[] = [
    {
      id: "print_mode",
      type: "choice",
      group: "Impressão",
      label: "Como você vai imprimir?",
      default: o.printMode,
      options: [
        { value: "multi", label: "Várias cores (AMS)" },
        { value: "single", label: "Uma cor por vez (encaixe)" },
      ],
    },
    {
      id: "separate",
      type: "multi",
      group: "Impressão",
      label: "Peças para imprimir separadas",
      hint: "A base sai com um encaixe rebaixado para cada uma. O que não for separado fica grudado na base (troque o filamento com uma pausa).",
      default: "text,top,icon",
      options: [
        { value: "text", label: "Nome" },
        { value: "top", label: "Texto de cima", showIf: "top_text" },
        { value: "icon", label: "Ícone", showIf: "icon" },
      ],
      showIf: SINGLE,
    },
  ];
  const advanced: Param[] = [
    { id: "top_size", type: "number", group: "Texto de cima", label: "Altura do texto de cima", default: 7, min: 3, max: 30, step: 0.5, unit: "mm", advanced: true, showIf: "top_text" },
    {
      id: "line_gap",
      type: "number",
      group: "Texto de cima",
      label: "Distância entre as linhas",
      hint: "Negativo aproxima as linhas até encostarem.",
      default: -1.5,
      min: -12,
      max: 10,
      step: 0.5,
      unit: "mm",
      advanced: true,
      showIf: "top_text",
    },
    { id: "icon_size", type: "number", group: "Ícone", label: "Tamanho do ícone", default: 9, min: 4, max: 30, step: 0.5, unit: "mm", advanced: true, showIf: "icon" },
    { id: "icon_offset_y", type: "number", group: "Ícone", label: "Subir ou descer o ícone", default: -2, min: -15, max: 15, step: 0.5, unit: "mm", advanced: true, showIf: "icon" },
    { id: "spacing", type: "number", group: "Nome", label: "Espaço entre letras", default: 1, min: 0.7, max: 1.6, step: 0.05, advanced: true },
    { id: "base_thickness", type: "number", group: "Tamanho", label: "Espessura da base", default: 3, min: 1.2, max: 8, step: 0.2, unit: "mm", advanced: true },
    { id: "text_thickness", type: "number", group: "Tamanho", label: "Relevo das letras", default: 1.6, min: 0.4, max: 5, step: 0.2, unit: "mm", advanced: true },
    { id: "border", type: "number", group: "Contorno", label: "Largura do contorno", default: 2.4, min: 0.8, max: 8, step: 0.2, unit: "mm", advanced: true },
    {
      id: "smooth",
      type: "number",
      group: "Contorno",
      label: "Preencher vãos entre letras",
      hint: "Quanto maior, mais liso fica o contorno.",
      default: 2.5,
      min: 0,
      max: 6,
      step: 0.5,
      unit: "mm",
      advanced: true,
    },
    {
      id: "fit_clearance",
      type: "number",
      group: "Impressão",
      label: "Folga do encaixe",
      hint: "Maior = a peça entra mais fácil. 0,2 mm funciona na maioria das impressoras.",
      default: 0.2,
      min: 0,
      max: 1,
      step: 0.05,
      unit: "mm",
      advanced: true,
      showIf: SINGLE,
    },
    { id: "pocket_depth", type: "number", group: "Impressão", label: "Profundidade do encaixe", default: 1, min: 0.4, max: 3, step: 0.2, unit: "mm", advanced: true, showIf: SINGLE },
  ];
  return { content, size, print, advanced };
}

/** Problems shared by every name-tag tool (a tool adds its own checks). */
export function validateNameTag(v: ParamValues): string | null {
  if (!String(v.text).trim()) return "Digite um nome.";
  if (separated(v).length && Number(v.base_thickness) - Number(v.pocket_depth) < 0.8)
    return "O encaixe está fundo demais para a base: deixe pelo menos 0,8 mm de base por baixo dele.";
  return null;
}

export const nameTagFileName = (prefix: string) => (v: ParamValues) => `${prefix}-${slugify([v.top_text, v.text].filter(isSet).join(" ")) || "nome"}`;

export const FIT_TIPS = [
  "Sem AMS: escolha “Uma cor por vez” — imprima a base com encaixes e cada peça na cor que quiser, depois é só encaixar.",
  "Se a peça ficar solta, diminua a folga do encaixe; se não entrar, aumente (em “Ajustes finos”).",
];
