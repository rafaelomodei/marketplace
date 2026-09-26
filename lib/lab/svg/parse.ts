import { colorDistance, mixColors, parseColor } from "./color";
import {
  apply,
  ellipseRing,
  IDENTITY,
  matrixScale,
  multiply,
  parseTransform,
  pathRings,
  pointsRing,
  rectRing,
  signedArea,
  simplify,
  type Matrix,
  type Ring,
} from "./geometry";
import { parseXml, type XmlNode } from "./xml";

/**
 * Reads an SVG into filled shapes grouped by color — the base of the Lab's SVG editor (each color becomes a
 * printable layer with its own height). Pure TypeScript: works in the browser, the worker and Node.
 */
export type SvgShape = {
  /** Color group (see SvgArt.colors), after merging near-identical colors. */
  color: string;
  /** Closed rings in the SVG's user units (y down), filled with the even-odd rule. */
  rings: Ring[];
  /** Area in the SVG's user units². */
  area: number;
};
export type SvgColor = { hex: string; area: number; shapes: number };
export type SvgArt = {
  /** In paint order: later shapes cover earlier ones. */
  shapes: SvgShape[];
  /** Largest area first. */
  colors: SvgColor[];
  /** Things we skipped, in plain language. */
  warnings: string[];
};

/** Colors closer than this are the same filament (anti-aliasing leftovers, "almost white" and white…). */
const MERGE_DISTANCE = 40;
/** More distinct colors than this are merged further: nobody prints 30 filaments. */
const MAX_COLORS = 12;

type Style = Record<string, string>;
const INHERITED = ["fill", "fill-opacity", "fill-rule", "stroke", "visibility", "color"];
const PROPS = [...INHERITED, "opacity", "display", "stroke-width"];

const declarations = (css: string): Style =>
  Object.fromEntries(
    css
      .split(";")
      .map((d) => d.split(":").map((s) => s.trim()))
      .filter(([k, v]) => k && v)
      .map(([k, v]) => [k.toLowerCase(), v.replace(/\s*!important$/, "")]),
  );

type Rule = { selector: string; specificity: number; style: Style; order: number };

/** Simple CSS from <style>: tag, .class, #id and tag.class selectors (what editors export). */
function cssRules(root: XmlNode): Rule[] {
  const rules: Rule[] = [];
  const walk = (n: XmlNode) => {
    if (n.tag === "style") {
      const css = n.text.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, sel, body] of css.matchAll(/([^{}@]+)\{([^}]*)\}/g))
        for (const s of sel.split(",").map((x) => x.trim()).filter(Boolean))
          if (/^[\w-]*(\.[\w-]+)*(#[\w-]+)?$/.test(s))
            rules.push({ selector: s, specificity: (s.includes("#") ? 100 : 0) + (s.split(".").length - 1) * 10 + (/^[\w-]/.test(s) ? 1 : 0), style: declarations(body), order: rules.length });
    }
    n.children.forEach(walk);
  };
  walk(root);
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}

function matches(selector: string, n: XmlNode) {
  const [head, id] = selector.split("#");
  if (id && n.attrs.id !== id) return false;
  const [tag, ...classes] = head.split(".");
  if (tag && tag !== n.tag) return false;
  const own = (n.attrs.class ?? "").split(/\s+/);
  return classes.every((c) => own.includes(c));
}

/** Presentation attributes < CSS rules < style="…" (the cascade, simplified). */
function ownStyle(n: XmlNode, rules: Rule[]): Style {
  const s: Style = {};
  for (const p of PROPS) if (n.attrs[p] !== undefined) s[p] = n.attrs[p];
  for (const r of rules) if (matches(r.selector, n)) Object.assign(s, r.style);
  if (n.attrs.style) Object.assign(s, declarations(n.attrs.style));
  return s;
}

const num = (v: string | undefined, fallback = 0) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : fallback;
};

export function parseSvg(markup: string): SvgArt {
  const root = parseXml(markup);
  if (root.tag !== "svg") throw new Error("O arquivo não parece ser um SVG.");
  const rules = cssRules(root);
  const byId = new Map<string, XmlNode>();
  const index = (n: XmlNode) => {
    if (n.attrs.id) byId.set(n.attrs.id, n);
    n.children.forEach(index);
  };
  index(root);

  // Precision: about 1/1500 of the drawing's size, in its own units (≈0.02 mm on a 3 cm piece).
  const vb = (root.attrs.viewBox ?? "").split(/[\s,]+/).map(Number);
  const size = vb.length === 4 && vb[2] > 0 ? Math.max(vb[2], vb[3]) : Math.max(num(root.attrs.width, 100), num(root.attrs.height, 100));
  const tol = size / 1500;

  const raw: { hex: string; rings: Ring[] }[] = [];
  const skipped = { stroke: 0, text: 0, image: 0 };

  const fillOf = (style: Style): string | null => {
    let fill = style.fill ?? "#000000";
    if (fill === "currentColor") fill = style.color ?? "#000000";
    const ref = fill.match(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/);
    if (ref) {
      // Gradients become one color: the average of their stops (following href to shared stops).
      let g = byId.get(ref[1]);
      for (let hop = 0; g && !g.children.some((c) => c.tag === "stop") && hop < 4; hop++) g = byId.get((g.attrs.href ?? g.attrs["xlink:href"] ?? "").slice(1));
      const stops = (g?.children ?? [])
        .filter((c) => c.tag === "stop")
        .map((c) => parseColor(ownStyle(c, rules)["stop-color"] ?? c.attrs["stop-color"] ?? declarations(c.attrs.style ?? "")["stop-color"]))
        .filter((c) => c && c.alpha > 0)
        .map((c) => c!.hex);
      return stops.length ? mixColors(stops) : null;
    }
    const c = parseColor(fill);
    return c && c.alpha > 0.05 ? c.hex : null;
  };

  const walk = (n: XmlNode, inherited: Style, m: Matrix, depth: number) => {
    if (depth > 40 || ["defs", "clipPath", "mask", "symbol", "pattern", "marker", "linearGradient", "radialGradient", "style", "title", "desc", "metadata"].includes(n.tag))
      return;
    const own = ownStyle(n, rules);
    const style: Style = { ...Object.fromEntries(INHERITED.filter((k) => inherited[k] !== undefined).map((k) => [k, inherited[k]])), ...own };
    if (own.display === "none" || num(own.opacity, 1) <= 0.05 || (n.tag !== "g" && num(style["fill-opacity"], 1) <= 0.05)) return;
    let t = multiply(m, parseTransform(n.attrs.transform));
    if (n.tag === "svg" && depth > 0) t = multiply(t, [1, 0, 0, 1, num(n.attrs.x), num(n.attrs.y)]);
    const a = n.attrs;
    const localTol = tol / matrixScale(t); // the same precision once transformed
    let rings: Ring[] | null = null;
    switch (n.tag) {
      case "path":
        rings = pathRings(a.d ?? "", localTol);
        break;
      case "rect":
        if (num(a.width) > 0 && num(a.height) > 0) {
          const rx = a.rx ?? a.ry;
          const ry = a.ry ?? a.rx;
          rings = [rectRing(num(a.x), num(a.y), num(a.width), num(a.height), num(rx), num(ry), localTol)];
        }
        break;
      case "circle":
        if (num(a.r) > 0) rings = [ellipseRing(num(a.cx), num(a.cy), num(a.r), num(a.r), localTol)];
        break;
      case "ellipse":
        if (num(a.rx) > 0 && num(a.ry) > 0) rings = [ellipseRing(num(a.cx), num(a.cy), num(a.rx), num(a.ry), localTol)];
        break;
      case "polygon":
      case "polyline":
        rings = [pointsRing(a.points ?? "")];
        break;
      case "use": {
        const target = byId.get((a.href ?? a["xlink:href"] ?? "").replace(/^#/, ""));
        if (target && target !== n) {
          const moved = multiply(t, [1, 0, 0, 1, num(a.x), num(a.y)]);
          // A <symbol> behaves like a group once it is used.
          walk(target.tag === "symbol" ? { ...target, tag: "g" } : target, style, moved, depth + 1);
        }
        return;
      }
      case "text":
        skipped.text++;
        return;
      case "image":
        skipped.image++;
        return;
      case "line":
        if (style.stroke && style.stroke !== "none") skipped.stroke++;
        return;
    }
    if (rings) {
      const hex = style.visibility === "hidden" ? null : fillOf(style);
      if (hex) {
        const clean = rings
          .map((r) => simplify(r.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => apply(t, p)), tol / 4))
          .filter((r) => r.length > 2 && Math.abs(signedArea(r)) > tol * tol);
        if (clean.length) raw.push({ hex, rings: clean });
      } else if (style.stroke && style.stroke !== "none") skipped.stroke++;
      return;
    }
    for (const c of n.children) walk(c, style, t, depth + 1);
  };
  walk(root, {}, IDENTITY, 0);

  const warnings: string[] = [];
  const background = dropBackground(raw);
  if (background) warnings.push("O fundo retangular do desenho foi removido — só o desenho vira peça.");
  if (skipped.stroke) warnings.push(`${skipped.stroke} linha(s) sem preenchimento foram ignoradas. No editor de desenho, converta os traços em formas (“contorno em objeto”).`);
  if (skipped.text) warnings.push(`${skipped.text} texto(s) foram ignorados. Converta os textos em curvas antes de exportar o SVG.`);
  if (skipped.image) warnings.push(`${skipped.image} imagem(ns) dentro do SVG foram ignoradas — só formas vetoriais viram peça.`);
  return group(raw, warnings);
}

type Box = [number, number, number, number];
const boxOf = (rings: Ring[]): Box => {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings)
    for (const [x, y] of r) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  return b;
};

/**
 * Removes the background most exported drawings carry: white-ish rectangles painted first that cover the whole
 * artwork. Otherwise it would become a plate and merge with the drawing's own white. A colored rectangle may be part
 * of the design, so it stays (the editor can hide it).
 */
function dropBackground(raw: { hex: string; rings: Ring[] }[]) {
  let dropped = 0;
  while (raw.length > 1) {
    const [first] = raw;
    const b = boxOf(first.rings);
    const rest = boxOf(raw.slice(1).flatMap((s) => s.rings));
    const fill = Math.abs(signedArea(first.rings[0])) / ((b[2] - b[0]) * (b[3] - b[1]));
    const covers = b[0] <= rest[0] + 1e-6 && b[1] <= rest[1] + 1e-6 && b[2] >= rest[2] - 1e-6 && b[3] >= rest[3] - 1e-6;
    if (first.rings.length !== 1 || fill < 0.98 || !covers || colorDistance(first.hex, "#ffffff") > 60) break;
    raw.shift();
    dropped++;
  }
  return dropped;
}

const area = (rings: Ring[]) => Math.abs(rings.reduce((s, r) => s + signedArea(r), 0));

/** Groups shapes by color, merging colors that would be the same filament anyway. */
function group(raw: { hex: string; rings: Ring[] }[], warnings: string[]): SvgArt {
  const exact = new Map<string, { area: number; shapes: number }>();
  for (const s of raw) {
    const e = exact.get(s.hex) ?? { area: 0, shapes: 0 };
    e.area += area(s.rings);
    e.shapes++;
    exact.set(s.hex, e);
  }
  // Biggest colors first; each color joins the first group close enough to it.
  const sorted = [...exact].sort((a, b) => b[1].area - a[1].area);
  let limit = MERGE_DISTANCE;
  let groups: { hex: string; members: string[] }[] = [];
  do {
    groups = [];
    for (const [hex] of sorted) {
      const g = groups.find((x) => colorDistance(x.hex, hex) < limit);
      if (g) g.members.push(hex);
      else groups.push({ hex, members: [hex] });
    }
    limit *= 1.5;
  } while (groups.length > MAX_COLORS);
  const of = new Map(groups.flatMap((g) => g.members.map((m) => [m, g.hex] as const)));
  const shapes = raw.map((s) => ({ color: of.get(s.hex)!, rings: s.rings, area: area(s.rings) }));
  const colors = groups
    .map((g) => ({
      hex: g.hex,
      area: g.members.reduce((s, m) => s + exact.get(m)!.area, 0),
      shapes: g.members.reduce((s, m) => s + exact.get(m)!.shapes, 0),
    }))
    .sort((a, b) => b.area - a.area);
  return { shapes, colors, warnings };
}
