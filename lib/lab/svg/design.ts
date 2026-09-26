import { inside, type Pt, type Ring } from "./geometry";
import { parseSvg, type SvgArt } from "./parse";

/**
 * What the SVG editor saves in a Lab param: the file, settings per color of the drawing (relief height, hidden) and
 * adjustments to single shapes (another color, its own height, hidden). Stored as a JSON string so it travels like any
 * other param value (form, worker, actions).
 */
export type LayerSettings = { height: number; hidden?: boolean };
export type ShapeSettings = { color?: string; height?: number; hidden?: boolean };
export type SvgDesign = {
  svg: string;
  name?: string;
  /** By color (hex, as read from the file). */
  layers: Record<string, LayerSettings>;
  /** By shape index (paint order in the file). */
  shapes?: Record<string, ShapeSettings>;
};

/** Largest color: flush with the base; details: raised a little. People change it per color or per shape. */
export const MAIN_HEIGHT = 0;
export const DETAIL_HEIGHT = 0.4;
/** Biggest drawing OpenSCAD handles comfortably in the browser. */
export const MAX_SHAPES = 600;

/** Accepts the saved JSON or a raw SVG (handy for actions / MCP: just send the file). */
export function readDesign(value: string | number | undefined): SvgDesign | null {
  const v = String(value ?? "").trim();
  if (v.startsWith("<")) return { svg: v, layers: {} };
  if (!v.startsWith("{")) return null;
  try {
    const d = JSON.parse(v) as SvgDesign;
    return typeof d.svg === "string" ? { ...d, layers: d.layers ?? {}, shapes: d.shapes ?? {} } : null;
  } catch {
    return null;
  }
}

export const writeDesign = (d: SvgDesign) => JSON.stringify(d);

/** Parsing is cached: the same file is read on every keystroke (validation, parts, OpenSCAD code). */
const cache = new Map<string, SvgArt | Error>();
export function artOf(svg: string): SvgArt {
  let art = cache.get(svg);
  if (!art) {
    try {
      art = parseSvg(svg);
    } catch (e) {
      art = e instanceof Error ? e : new Error(String(e));
    }
    if (cache.size > 6) cache.delete(cache.keys().next().value!);
    cache.set(svg, art);
  }
  if (art instanceof Error) throw art;
  return art;
}

/** OpenSCAD part id of a color layer. */
export const layerId = (hex: string) => `c-${hex.slice(1)}`;

/** A shape as it will be printed: its color (after adjustments) and its relief height. */
export type DesignShape = {
  index: number;
  color: string;
  /** Color group it had in the file. */
  source: string;
  height: number;
  hidden: boolean;
  /** Has its own adjustment (color, height or hidden). */
  custom: boolean;
  rings: Ring[];
  area: number;
};

export type SvgLayer = {
  id: string;
  hex: string;
  /** Height of the color (shapes with their own height keep it). */
  height: number;
  /** Tallest shape of the color: the part exists when there is inlay or relief. */
  maxHeight: number;
  hidden: boolean;
  area: number;
  /** Position by area, 0 = largest: "Cor 1", "Cor 2"… */
  index: number;
  /** Visible shapes of this color. */
  shapes: number;
  /** Some shape of this color has its own adjustment. */
  custom: boolean;
};

const defaultHeight = (art: SvgArt, hex: string) => (art.colors[0]?.hex === hex ? MAIN_HEIGHT : DETAIL_HEIGHT);
const layerHeight = (art: SvgArt, d: SvgDesign, hex: string) => d.layers[hex]?.height ?? defaultHeight(art, hex);

/** Every shape with its settings applied (a hidden color hides its shapes). */
export function designShapes(art: SvgArt, d: SvgDesign): DesignShape[] {
  return art.shapes.map((s, index) => {
    const own = d.shapes?.[index] ?? {};
    const color = own.color ?? s.color;
    return {
      index,
      color,
      source: s.color,
      height: own.height ?? layerHeight(art, d, color),
      hidden: !!own.hidden || !!d.layers[color]?.hidden,
      custom: own.color !== undefined || own.height !== undefined || !!own.hidden,
      rings: s.rings,
      area: s.area,
    };
  });
}

/** Every color of the drawing (including colors given to shapes in the editor), largest first. */
export function designLayers(art: SvgArt, d: SvgDesign): SvgLayer[] {
  const shapes = designShapes(art, d);
  const by = new Map<string, DesignShape[]>();
  for (const s of shapes) by.set(s.color, [...(by.get(s.color) ?? []), s]);
  return [...by]
    .map(([hex, list]) => {
      const shown = list.filter((s) => !s.hidden);
      return {
        id: layerId(hex),
        hex,
        height: layerHeight(art, d, hex),
        maxHeight: Math.max(0, ...shown.map((s) => s.height)),
        hidden: !!d.layers[hex]?.hidden,
        area: list.reduce((sum, s) => sum + s.area, 0),
        index: 0,
        shapes: shown.length,
        custom: list.some((s) => s.custom),
      };
    })
    .sort((a, b) => b.area - a.area)
    .map((l, index) => ({ ...l, index }));
}

export type SvgLayout = {
  /** mm per SVG unit. */
  scale: number;
  /** Drawing size in mm. */
  width: number;
  height: number;
  /** Visible shapes in mm, paint order, y up; centered on x = 0 with the bottom at y = 0. */
  shapes: DesignShape[];
  /** Visible layers with visible shapes, largest first. */
  layers: SvgLayer[];
};

/** Places the visible shapes of the drawing at `width` mm (hidden ones, like a background, don't count). */
export function layoutDesign(d: SvgDesign, width: number): SvgLayout {
  const art = artOf(d.svg);
  const shapes = designShapes(art, d).filter((s) => !s.hidden);
  if (!shapes.length) throw new Error(art.shapes.length ? "Todas as cores estão escondidas: mostre pelo menos uma." : "O SVG não tem formas preenchidas para virar peça.");
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of shapes)
    for (const r of s.rings)
      for (const [x, y] of r) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const scale = width / Math.max(x1 - x0, 1e-9);
  const cx = (x0 + x1) / 2;
  const toMm = ([x, y]: Pt): Pt => [(x - cx) * scale, (y1 - y) * scale];
  return {
    scale,
    width,
    height: (y1 - y0) * scale,
    shapes: shapes.map((s) => ({ ...s, rings: s.rings.map((r) => r.map(toMm)), area: s.area * scale * scale })),
    layers: designLayers(art, d).filter((l) => !l.hidden && l.shapes > 0),
  };
}

/** True where the drawing has material (any visible shape). */
export const solidAt = (layout: SvgLayout, p: Pt) => layout.shapes.some((s) => inside(s.rings, p));

/** True where the piece has material once the base grows by `r` mm around the drawing (the border). */
export const solidNear = (layout: SvgLayout, [x, y]: Pt, r: number) =>
  solidAt(layout, [x, y]) ||
  (r > 0 && Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4).some((a) => solidAt(layout, [x + r * 0.95 * Math.cos(a), y + r * 0.95 * Math.sin(a)])));

/** The shape seen from above at a point (the last one painted there), or undefined. */
export const shapeAt = (layout: SvgLayout, p: Pt) => layout.shapes.findLast((s) => inside(s.rings, p));

/** Lowest point of the drawing on the vertical line at x, or null if the line misses it. */
export function bottomAt(layout: SvgLayout, x: number): number | null {
  let low: number | null = null;
  for (const s of layout.shapes)
    for (const r of s.rings)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [a, b] = [r[j], r[i]];
        if (a[0] > x === b[0] > x) continue;
        const y = a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
        if (low === null || y < low) low = y;
      }
  return low;
}

/** Returns the design with some shapes adjusted (a `null` field removes that adjustment). */
export function adjustShapes(d: SvgDesign, indexes: number[], patch: { [K in keyof ShapeSettings]?: ShapeSettings[K] | null }): SvgDesign {
  const shapes = { ...d.shapes };
  for (const i of indexes) {
    const next: ShapeSettings = { ...shapes[i] };
    for (const [k, v] of Object.entries(patch) as [keyof ShapeSettings, never][])
      if (v === null) delete next[k];
      else next[k] = v;
    if (Object.keys(next).length) shapes[i] = next;
    else delete shapes[i];
  }
  return { ...d, shapes };
}

/** Returns the design with a color's settings changed. */
export const adjustLayer = (art: SvgArt, d: SvgDesign, hex: string, patch: Partial<LayerSettings>): SvgDesign => ({
  ...d,
  layers: { ...d.layers, [hex]: { height: layerHeight(art, d, hex), hidden: !!d.layers[hex]?.hidden, ...patch } },
});

/** SVG path data for rings (preview in the editor). */
export const ringsPath = (rings: Ring[]) => rings.map((r) => `M${r.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join("L")}Z`).join("");
