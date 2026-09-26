import type { ParamValues } from "../../params";
import svgRelief from "../../scad/svg-relief.scad";
import { bottomAt, layoutDesign, ringsPath, solidNear, type Pt, type SvgLayout } from "../../svg";
import type { LabTool, ToolFix, ToolGuide } from "../../types";
import { designOf, reliefFileName, reliefHooks, reliefLayout, reliefParams, reliefParts, validateRelief } from "../shared/svg-relief";
import model from "./clip.scad";
import { STRAWBERRY_SVG } from "./sample";

const BASE = { label: "Base e borda", color: "#FFFFFF" };
const hooks = reliefHooks(BASE);
const MAX_WIDTH = 80;
const shared = reliefParams({
  design: { svg: STRAWBERRY_SVG, name: "Morango", layers: { "#43a047": { height: 0.8 }, "#ffe8a3": { height: 0.4 }, "#ffffff": { height: 0.4 } } },
  width: 30,
  minWidth: 14,
  maxWidth: MAX_WIDTH,
});

type Slot = { x0: number; x1: number; y0: number; y1: number; path: Pt[]; wire: number };

/** How much of the slot must sit inside the piece (border included); less and the clip shows through the sides. */
const MIN_COVER = 0.85;
const mmText = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * Where the clip goes on a laid-out drawing: a slot opening at the bottom edge, as deep as asked from the point where
 * the material covers the whole slot width, plus the virtual paper clip sitting in it (centerline of the wire).
 * The piece is the drawing grown by the border, so the border counts as material.
 */
function fitSlot(layout: SvgLayout, v: ParamValues, cx = Number(v.slot_offset)): Slot | string {
  const [w, depth, border] = [Number(v.slot_width), Number(v.slot_depth), Number(v.border)];
  const xs = Array.from({ length: 11 }, (_, i) => cx - w / 2 + (w * i) / 10);
  const bottoms = xs.map((x) => bottomAt(layout, x));
  if (bottoms.some((b) => b === null)) return "Nessa posição o clipe fica fora do desenho.";
  const low = Math.min(...(bottoms as number[]));
  const entry = Math.max(...(bottoms as number[])) - border;
  const y1 = entry + depth;
  // Share of the slot (from where the clip enters to a bit past its end) inside the piece.
  let inside = 0;
  let total = 0;
  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 5; j++) {
      total++;
      if (solidNear(layout, [cx - w / 2 + 0.3 + ((w - 0.6) * i) / 8, entry + 0.5 + ((y1 + 0.8 - entry - 0.5) * j) / 5], border)) inside++;
    }
  if (inside / total < MIN_COVER) return `Nessa posição o desenho é mais estreito que o clipe (${mmText(w)} mm): ele ficaria aparecendo pelos lados.`;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: low - border - 1, y1, path: paperClip(cx, y1, w, Number(v.slot_height)), wire: Number(v.slot_height) * 0.85 };
}

export function clipSlot(v: ParamValues): { slot: Slot; error?: undefined } | { slot?: undefined; error: string } {
  const r = reliefLayout(v);
  if (!r.layout) return { error: r.error };
  const s = fitSlot(r.layout, v);
  return typeof s === "string" ? { error: s } : { slot: s };
}

/**
 * When the clip does not fit: the smallest piece where it fits in the same place, and the nearest place where it fits
 * at this size — offered as buttons, so nobody has to guess sizes.
 */
export function clipFixes(v: ParamValues): ToolFix[] {
  const r = reliefLayout(v);
  if (!r.layout || typeof fitSlot(r.layout, v) !== "string") return [];
  const fixes: ToolFix[] = [];
  const width = Number(v.width);
  const offset = Number(v.slot_offset);
  const d = designOf(v)!;
  for (let w = Math.floor(width) + 1; w <= MAX_WIDTH; w++) {
    const at = Math.round(((offset * w) / width) * 2) / 2; // same spot, scaled with the drawing
    if (typeof fitSlot(layoutDesign(d, w), v, at) !== "string") {
      fixes.push({ label: `Aumentar a peça para ${w} mm`, values: { width: w, slot_offset: at } });
      break;
    }
  }
  const half = Math.min(30, width / 2);
  const offsets: number[] = [];
  for (let o = -half; o <= half; o += 0.5) offsets.push(o);
  offsets.sort((a, b) => Math.abs(a - offset) - Math.abs(b - offset));
  const o = offsets.find((x) => typeof fitSlot(r.layout, v, x) !== "string");
  if (o !== undefined) fixes.push({ label: `Mover o clipe ${mmText(Math.abs(o))} mm para a ${o < 0 ? "esquerda" : "direita"}`, values: { slot_offset: o } });
  return fixes;
}

/**
 * Centerline of a classic paper clip (two nested loops) whose top end touches the end of the slot at `top`,
 * `width` wide, hanging down. Straight runs are just their ends; turns are sampled.
 */
function paperClip(cx: number, top: number, width: number, slotHeight: number): Pt[] {
  const d = slotHeight * 0.85;
  const L = width * 4.8; // a 10 mm wide clip is about 48 mm long
  const r0 = (width - d) / 2 - 0.15;
  const g = Math.max(d * 1.6, width * 0.2); // gap between the wires
  const [r1, r2] = [r0 - g / 2, r0 - g];
  const apex = top - 0.2 - d / 2;
  const yT = apex - r0;
  const yB = apex - L + d + r1;
  const yT2 = yT - L * 0.2;
  const turn = (c: Pt, r: number, from: number): Pt[] =>
    Array.from({ length: 13 }, (_, i) => {
      const a = ((from + (180 * i) / 12) * Math.PI) / 180;
      return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
    });
  const path: Pt[] = [
    [r0, apex - L * 0.62],
    ...turn([0, yT], r0, 0),
    ...turn([-r0 + r1, yB], r1, 180),
    ...turn([r0 - g - r2, yT2], r2, 0),
    [-r0 + g, yB + L * 0.12],
  ];
  return path.map(([x, y]) => [x + cx, y]);
}

const n = (x: number) => +x.toFixed(3);

/** Enfeite para clipe: a colored drawing (from an SVG) with a slot for the top of a paper clip. */
export const clipTopper: LabTool = {
  id: "enfeite-de-clipe",
  name: "Enfeite para clipe",
  tagline: "Envie um desenho em SVG e transforme num enfeite colorido que encaixa na ponta do clipe — cada cor com a sua altura.",
  status: "ready",
  tags: ["Seu desenho (SVG)", "Várias cores", "Sem suporte"],
  preview: "/lab/previews/enfeite-de-clipe.png",
  source: `${svgRelief}\n${model}`,
  ...hooks,
  // The virtual clip only shows in the 3D preview (with a button to hide it).
  parts: (v) => [...reliefParts(BASE, v), { id: "clip", label: "Clipe", defaultColor: "#C8977F", preview: true }],
  prelude: (v) => {
    const s = clipSlot(v);
    if (!s.slot) return hooks.prelude!(v);
    const { x0, x1, y0, y1, path, wire } = s.slot;
    return [
      hooks.prelude!(v),
      `slot_x0 = ${n(x0)}; slot_x1 = ${n(x1)}; slot_y0 = ${n(y0)}; slot_y1 = ${n(y1)};`,
      `clip_wire = ${n(wire)};`,
      `clip_path = [${path.map(([x, y]) => `[${n(x)},${n(y)}]`).join(",")}];`,
    ].join("\n");
  },
  guides: (v) => {
    const s = clipSlot(v);
    if (!s.slot) return [];
    const { x0, x1, y0, y1, path, wire } = s.slot;
    const ys = path.map((p) => p[1]);
    const guides: ToolGuide[] = [
      { kind: "ghost", part: "clip", drag: "clip", width: wire, d: `M${path.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}`, box: [x0, Math.min(...ys), x1, y1] },
      { kind: "cut", drag: "clip", d: ringsPath([[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]), box: [x0, y0, x1, y1] },
    ];
    return guides;
  },
  // Drag the clip (or its slot) sideways to move it, into the piece / out of it to change how deep it goes.
  drags: [{ part: "clip", x: "slot_offset", y: "slot_depth", hint: "Arraste o clipe para mudar onde ele encaixa." }],
  params: [
    ...shared.drawing,
    ...shared.size,
    {
      id: "slot_offset",
      type: "number",
      group: "Encaixe do clipe",
      label: "Posição do clipe",
      hint: "Mova o clipe para a esquerda ou para a direita (0 = no meio).",
      default: 0,
      min: -30,
      max: 30,
      step: 0.5,
      unit: "mm",
    },
    { id: "slot_width", type: "number", group: "Encaixe do clipe", label: "Largura do clipe", default: 10, min: 5, max: 20, step: 0.5, unit: "mm" },
    {
      id: "slot_height",
      type: "number",
      group: "Encaixe do clipe",
      label: "Altura da fenda",
      hint: "A grossura do arame do clipe, com uma folguinha.",
      default: 1,
      min: 0.4,
      max: 3,
      step: 0.1,
      unit: "mm",
    },
    { id: "slot_depth", type: "number", group: "Encaixe do clipe", label: "Profundidade do encaixe", hint: "Quanto o clipe entra na peça.", default: 5, min: 2, max: 20, step: 0.5, unit: "mm" },
    ...shared.advanced,
  ],
  colorsAfterGroup: "Desenho",
  validate: (v) => {
    const problem = validateRelief(v);
    if (problem) return problem;
    if (Number(v.base_thickness) - Number(v.slot_height) < 1.2)
      return "A base está fina demais para a fenda do clipe: deixe pelo menos 0,6 mm acima e abaixo dela (aumente a espessura da base).";
    if (Number(v.slot_width) < 6) return "O clipe precisa de pelo menos 6 mm de largura.";
    return clipSlot(v).error ?? null;
  },
  fixes: clipFixes,
  fileName: reliefFileName("enfeite-clipe"),
  printTips: [
    "Imprima deitado, do jeito que o arquivo sai, sem suporte: a fenda do clipe é uma ponte curta que a impressora faz sozinha.",
    "Com AMS: o 3MF já vem com cada cor como uma parte separada — é só escolher o filamento de cada uma.",
    "Encaixe a ponta arredondada do clipe na fenda da borda de baixo. Se ficar solto, diminua a altura da fenda; se não entrar, aumente.",
    "Uma gota de cola instantânea dentro da fenda deixa o enfeite firme de vez.",
  ],
};
