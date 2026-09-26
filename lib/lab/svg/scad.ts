import type { SvgLayout } from "./design";

const n = (v: number) => String(+v.toFixed(3));

/**
 * OpenSCAD code for a laid-out drawing, used by lib/lab/scad/svg-relief.scad:
 *   svg_ids / svg_heights  — the visible color layers (part ids and their tallest relief);
 *   svg_all()              — the whole silhouette;
 *   svg_solid(i)           — color i in 3D: what is visible of each of its shapes (shapes painted on top are cut
 *                            out), extruded from `inlay` below the top of the base up to the shape's own height,
 * so the colored parts never overlap and a slicer can give each one its own filament.
 */
export function designScad(layout: SvgLayout): string {
  const { shapes, layers } = layout;
  const out: string[] = [
    `svg_ids = [${layers.map((l) => JSON.stringify(l.id)).join(", ")}];`,
    `svg_heights = [${layers.map((l) => n(l.maxHeight)).join(", ")}];`,
    `svg_width = ${n(layout.width)};`,
    `svg_height = ${n(layout.height)};`,
  ];
  shapes.forEach((s, k) => {
    const points: string[] = [];
    const paths: string[] = [];
    for (const r of s.rings) {
      const start = points.length;
      for (const [x, y] of r) points.push(`[${n(x)},${n(y)}]`);
      paths.push(`[${r.map((_, i) => start + i).join(",")}]`);
    }
    out.push(`module svg_s${k}() polygon(points=[${points.join(",")}], paths=[${paths.join(",")}]);`);
  });
  // svg_a{k}: everything painted after shape k, built as a chain so OpenSCAD reuses each union.
  shapes.forEach((_, k) => out.push(k === shapes.length - 1 ? `module svg_a${k}() {}` : `module svg_a${k}() { svg_s${k + 1}(); svg_a${k + 1}(); }`));
  shapes.forEach((_, k) => out.push(`module svg_v${k}() difference() { svg_s${k}(); svg_a${k}(); }`));
  out.push(`module svg_all() { svg_s0(); svg_a0(); }`);
  // Shapes of a color with the same height share one extrusion; `inlay` comes from svg-relief.scad.
  const body = layers
    .map((l, i) => {
      const byHeight = new Map<number, string[]>();
      shapes.forEach((s, k) => s.color === l.hex && byHeight.set(s.height, [...(byHeight.get(s.height) ?? []), `svg_v${k}();`]));
      const solids = [...byHeight].map(([h, own]) => `if (inlay + ${n(h)} > 0.001) linear_extrude(inlay + ${n(h)}) { ${own.join(" ")} }`);
      return `  if (i == ${i}) { ${solids.join(" ")} }`;
    })
    .join("\n");
  out.push(`module svg_solid(i) {\n${body}\n}`);
  return out.join("\n");
}
