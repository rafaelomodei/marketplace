import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseStl } from "@/lib/lab/mesh";
import { paramsSchema, type ParamValues } from "@/lib/lab/params";
import { renderTool } from "@/lib/lab/server";
import { adjustLayer, adjustShapes, artOf, bottomAt, designLayers, layoutDesign, parseSvg, readDesign, shapeAt, writeDesign } from "@/lib/lab/svg";
import { pathRings } from "@/lib/lab/svg/geometry";
import { clipFixes, clipSlot, clipTopper } from "@/lib/lab/tools/clip";

/** An "Illustrator-like" export: CSS classes, a white background, a gradient, <use>, a stroke and a text. */
const EXPORTED = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: some editor -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 160">
  <defs>
    <style>.cls-1{fill:#e87aa6;}.cls-2{fill:#fff;}.cls-3{fill:url(#g);}.st{fill:none;stroke:#000;stroke-width:2}</style>
    <linearGradient id="g"><stop offset="0" stop-color="#e6ae2f"/><stop offset="1" stop-color="#e8b43a"/></linearGradient>
    <path id="dot" d="M0,0a4,4 0 1,0 8,0a4,4 0 1,0 -8,0z"/>
  </defs>
  <rect width="200" height="160" fill="#fdfdfd"/>
  <g transform="translate(10 10)">
    <path class="cls-1" d="M90 10 L170 70 L170 110 L10 110 L10 70 Z"/>
    <polygon class="cls-2" points="90,14 60,70 75,70"/>
    <polygon class="cls-2" points="90,14 105,70 120,70"/>
    <circle class="cls-3" cx="90" cy="8" r="9"/>
    <use xlink:href="#dot" x="30" y="90" class="cls-3"/>
    <use xlink:href="#dot" x="130" y="90" class="cls-3"/>
    <path class="st" d="M20 100 L160 100"/>
    <text x="80" y="60">1</text>
  </g>
</svg>`;

const SQUARE = (color: string, extra = "") => `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}"/>${extra}</svg>`;
const xs = (s: Float32Array) => s.filter((_, i) => i % 3 === 0);
const zs = (s: Float32Array) => s.filter((_, i) => i % 3 === 2);

describe("lab svg: reading files", () => {
  it("reads classes, gradients and <use>, drops the white background and reports what it skipped", () => {
    const art = parseSvg(EXPORTED);
    expect(art.colors.map((c) => c.hex)).toEqual(["#e87aa6", "#ffffff", "#e7b135"]); // gradient = average of its stops
    expect(art.shapes).toHaveLength(6); // body, 2 triangles, circle, 2 dots (no background, stroke or text)
    expect(art.colors[2].shapes).toBe(3);
    expect(art.warnings.join(" ")).toMatch(/fundo.*removido/);
    expect(art.warnings.join(" ")).toMatch(/linha/);
    expect(art.warnings.join(" ")).toMatch(/texto/);
    // group transform applied: the body starts at x = 10 + 10
    expect(Math.min(...art.shapes[0].rings[0].map((p) => p[0]))).toBeCloseTo(20);
  });

  it("keeps a colored rectangle (it may be the design) and merges near-identical colors", () => {
    const art = parseSvg(SQUARE("#3366cc", `<circle cx="50" cy="50" r="20" fill="#ff0000"/><circle cx="20" cy="20" r="5" fill="#fe0101"/>`));
    expect(art.colors.map((c) => c.hex)).toEqual(["#3366cc", "#ff0000"]);
    expect(art.warnings).toEqual([]);
  });

  it("flattens path commands: relative, smooth curves and arcs with packed flags", () => {
    const [ring] = pathRings("m10 10h20v20h-20z", 0.1);
    expect(ring).toEqual([[10, 10], [30, 10], [30, 30], [10, 30]]);
    // half circle of radius 10 from (0,0) to (20,0) — flags written as "01"
    const [arc] = pathRings("M0 0a10 10 0 01 20 0z", 0.01);
    const ys = arc.map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(-10, 1);
    expect(arc.at(-1)![0]).toBeCloseTo(20, 5);
    // S reflects the previous C control point: symmetric wave
    const [wave] = pathRings("M0 0C0 10 10 10 10 0S20 -10 20 0", 0.01);
    expect(Math.max(...wave.map((p) => p[1]))).toBeCloseTo(7.5, 1);
    expect(Math.min(...wave.map((p) => p[1]))).toBeCloseTo(-7.5, 1);
    expect(pathRings("M0 0L10 0L10 10Z 5 5", 0.1)).toHaveLength(1); // stray numbers don't hang the parser
  });

  it("rejects what is not an SVG", () => {
    expect(() => parseSvg("<html><body/></html>")).toThrow(/SVG/);
    expect(readDesign("not a design")).toBeNull();
    expect(readDesign(SQUARE("red"))?.layers).toEqual({});
  });
});

describe("lab svg: layout", () => {
  it("scales the visible colors to the width, centered, with the bottom at y = 0", () => {
    const design = { svg: SQUARE("#3366cc", `<rect x="0" y="100" width="200" height="50" fill="#00aa00"/>`), layers: {} };
    const all = layoutDesign(design, 40);
    expect(all.width).toBe(40);
    expect(all.height).toBeCloseTo(30); // 200×150 units → 40×30 mm
    expect(bottomAt(all, 0)).toBeCloseTo(0);
    // hiding the wide green strip: only the square counts
    const square = layoutDesign({ ...design, layers: { "#00aa00": { height: 0, hidden: true } } }, 40);
    expect(square.height).toBeCloseTo(40);
    expect(square.layers.map((l) => l.hex)).toEqual(["#3366cc"]);
    expect(() => layoutDesign({ ...design, layers: { "#00aa00": { height: 0, hidden: true }, "#3366cc": { height: 0, hidden: true } } }, 40)).toThrow(/escondidas/);
  });
});

describe("lab svg: editing colors and single shapes", () => {
  // Three red dots on a blue square.
  const svg = SQUARE("#3366cc", [20, 50, 80].map((x) => `<circle cx="${x}" cy="50" r="8" fill="#ff0000"/>`).join(""));
  const art = artOf(svg);
  const base = { svg, layers: {} };

  it("moves one shape to another color, or to a new one, and back", () => {
    const blue = adjustShapes(base, [2], { color: "#3366cc" });
    expect(designLayers(art, blue).map((l) => [l.hex, l.shapes, l.custom])).toEqual([["#3366cc", 2, true], ["#ff0000", 2, false]]);
    const green = adjustShapes(base, [2], { color: "#00aa00" });
    expect(designLayers(art, green).map((l) => l.hex)).toEqual(["#3366cc", "#ff0000", "#00aa00"]);
    expect(adjustShapes(green, [2], { color: null }).shapes).toEqual({}); // no adjustment left
  });

  it("a shape can have its own height; the color's height applies to the rest", () => {
    const d = adjustShapes(adjustLayer(art, base, "#ff0000", { height: 0.6 }), [1], { height: 1.5 });
    const layout = layoutDesign(d, 50);
    expect(layout.shapes.map((s) => s.height)).toEqual([0, 1.5, 0.6, 0.6]); // square flush, first dot on its own
    expect(layout.layers.find((l) => l.hex === "#ff0000")?.maxHeight).toBe(1.5);
    // what you click from above: the dot, not the square under it
    expect(shapeAt(layout, [-15, 25])?.index).toBe(1);
    expect(shapeAt(layout, [-20, 45])?.index).toBe(0);
  });

  it("hides a single shape", () => {
    const d = adjustShapes(base, [2], { hidden: true });
    expect(layoutDesign(d, 50).shapes.map((s) => s.index)).toEqual([0, 1, 3]);
    expect(designLayers(art, d).find((l) => l.hex === "#ff0000")?.shapes).toBe(2);
  });

  it("renders each shape at its own height inside its color's part", async () => {
    const d = adjustShapes(adjustLayer(art, base, "#ff0000", { height: 0.6 }), [1], { height: 1.5 });
    const r = await renderTool("enfeite-de-clipe", { design: writeDesign(d), width: 50 });
    const red = parseStl(r.parts["c-ff0000"]);
    const tops = new Set([...zs(red)].map((z) => +z.toFixed(2)));
    expect([...tops].sort()).toEqual([2.4, 3.6, 4.5]); // inlay floor, 3 + 0.6 and 3 + 1.5
  }, 60000);
});

describe("lab: enfeite de clipe", () => {
  it("renders the sample: base, one part per color at its own height, and the slot inside the base", async () => {
    const r = await renderTool("enfeite-de-clipe", {});
    expect(Object.keys(r.parts)).toEqual(["base", "c-e63946", "c-43a047", "c-ffe8a3", "c-ffffff"]); // no virtual clip on the server
    const [w, , h] = r.size!;
    expect(w).toBeCloseTo(30 + 2 * 1, 0); // drawing + border on each side
    expect(h).toBeCloseTo(3 + 0.8, 3); // base + the green's relief
    const top = (id: string) => Math.max(...zs(parseStl(r.parts[id])));
    expect(top("c-e63946")).toBeCloseTo(3, 3); // flush
    expect(top("c-ffe8a3")).toBeCloseTo(3.4, 3);
    expect(Math.min(...zs(parseStl(r.parts["c-e63946"])))).toBeCloseTo(3 - 0.6, 3); // inlaid 0.6 mm into the base

    // the slot: faces of the base at the slot's floor (z = 1) and ceiling (z = 2), 10 mm wide
    const base = parseStl(r.parts.base);
    const inSlot = [...xs(base)].filter((_, i) => [1, 2].some((z) => Math.abs(base[i * 3 + 2] - z) < 1e-3));
    expect(Math.min(...inSlot)).toBeCloseTo(-5, 1);
    expect(Math.max(...inSlot)).toBeCloseTo(5, 1);

    const model = strFromU8(unzipSync(r.file3mf!)["3D/3dmodel.model"]);
    expect(model.match(/<object /g)).toHaveLength(6); // five parts + the group
  }, 60000);

  it("accepts a raw SVG, gives each color its height and leaves hidden colors out", async () => {
    const svg = SQUARE("#3366cc", `<circle cx="50" cy="50" r="20" fill="#ff0000"/>`);
    const r = await renderTool("enfeite-de-clipe", { design: svg, width: 25 });
    expect(Object.keys(r.parts)).toEqual(["base", "c-3366cc", "c-ff0000"]);
    const design = writeDesign({ svg, name: "Meu Desenho", layers: { "#ff0000": { height: 1.2 }, "#3366cc": { height: 0 } } });
    const raised = await renderTool("enfeite-de-clipe", { design, width: 25, inlay: 0 });
    expect(Object.keys(raised.parts)).toEqual(["base", "c-ff0000"]); // flush and not inlaid: no part of its own
    expect(Math.max(...zs(parseStl(raised.parts["c-ff0000"])))).toBeCloseTo(3 + 1.2, 3);
    expect(raised.files[0].name).toBe("enfeite-clipe-meu-desenho-base.stl");
  }, 60000);

  it("places the slot and the virtual clip where the material starts", () => {
    const values = paramsSchema(clipTopper.params!).parse({ design: SQUARE("#3366cc"), width: 30, slot_offset: 4 }) as ParamValues;
    const { slot } = clipSlot(values);
    expect(slot!.x0).toBeCloseTo(4 - 5);
    expect(slot!.x1).toBeCloseTo(4 + 5);
    expect(slot!.y1).toBeCloseTo(-1 + 5); // square's bottom (0) minus the 1 mm border, 5 mm deep
    const ys = slot!.path.map((p) => p[1]);
    expect(Math.max(...ys)).toBeLessThan(slot!.y1);
    expect(Math.min(...ys)).toBeLessThan(-40); // hangs below the piece
    expect(clipTopper.guides!(values).map((g) => g.kind)).toEqual(["ghost", "cut"]);
  });

  it("counts the border as material and offers fixes when the clip does not fit", () => {
    // An upside-down "T": a foot 30 mm wide and 3 mm tall, then a stem only 6 mm wide where the clip goes.
    const foot = `<svg viewBox="0 0 300 200"><path fill="#ff66aa" d="M0 200H300V170H180V0H120V170H0Z"/></svg>`;
    const at = (o: Record<string, string | number>) => paramsSchema(clipTopper.params!).parse({ design: foot, width: 30, ...o }) as ParamValues;
    expect(clipSlot(at({ border: 1 })).slot).toBeDefined(); // 6 mm + 1 mm of border on each side holds the 10 mm clip
    const tight = at({ border: 0 });
    expect(clipTopper.validate!(tight)).toMatch(/mais estreito que o clipe/);
    const fixes = clipFixes(tight);
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) expect(clipTopper.validate!({ ...tight, ...f.values }), f.label).toBeNull();
    expect(fixes[0].label).toMatch(/^Aumentar a peça para \d+ mm$/);
    expect(clipFixes(at({ border: 1 }))).toEqual([]);
  });

  it("rejects a slot outside the drawing, a base too thin and a drawing too small", async () => {
    const bad = (values: Record<string, unknown>) => expect(renderTool("enfeite-de-clipe", values)).rejects.toMatchObject({ status: 400 });
    await bad({ slot_offset: 20 });
    await bad({ base_thickness: 1.6, slot_height: 1 });
    await bad({ width: 14, slot_depth: 20 });
    await bad({ design: "<svg viewBox='0 0 10 10'></svg>" });
  });
});
