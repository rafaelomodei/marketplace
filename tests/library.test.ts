import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

// Throwaway app, library and downloads folders before any module reads the paths.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "library-test-"));
process.env.STUDIO_ROOT = root;
process.env.STUDIO_LIBRARY = path.join(root, "biblioteca");
process.env.STUDIO_DOWNLOADS = path.join(root, "Downloads");
fs.mkdirSync(process.env.STUDIO_DOWNLOADS, { recursive: true });

const { parseGcodeStats, parseDuration } = await import("@/lib/slicer");
const { computeCost, costSettingsSchema } = await import("@/lib/costing");
const { inspect3mf, measureModel, stlTriangles, threeMfTriangles } = await import("@/lib/print-files");
const lib = await import("@/lib/library");

const settings = costSettingsSchema.parse({});

/** A 1 mm tetrahedron as binary STL. */
function stl(): Buffer {
  const tris = [
    [0, 0, 0, 1, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 1, 1, 0, 0],
    [1, 0, 0, 0, 0, 1, 0, 1, 0],
  ];
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.forEach((v, k) => buf.writeFloatLE(v, 84 + i * 50 + 12 + k * 4)));
  return buf;
}

const MODEL = `<?xml version="1.0"?><model xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
<resources>
<object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/></vertices>
<triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>
<object id="2" type="model"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 5 0 0"/></components></object>
</resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 100 0"/></build></model>`;

async function threeMf(configured: boolean) {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#4a4" } }).png().toBuffer();
  return zipSync({
    "3D/3dmodel.model": strToU8(MODEL),
    ...(configured && {
      "Metadata/project_settings.config": strToU8(JSON.stringify({
        printer_settings_id: "Creality Ender-3 V3 0.4 nozzle",
        print_settings_id: "0.28mm Vaso",
        filament_type: ["PLA", "PLA"],
        filament_colour: ["#56DF3D", "#FFFFFF"],
        filament_settings_id: ["Generic PLA Voolt 3D", "Generic PLA"],
        filament_cost: ["123", "0"],
      })),
      "Metadata/model_settings.config": strToU8(`<config><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Vaso"/></plate><plate><metadata key="plater_id" value="2"/></plate></config>`),
      "Metadata/plate_1.png": new Uint8Array(png),
      "Metadata/plate_2.png": new Uint8Array(png),
      "Metadata/plate_1_small.png": new Uint8Array(png),
    }),
  });
}

describe("slicer output", () => {
  it("reads grams, time and filaments from the end of a Creality Print G-code", () => {
    const gcode = [
      "; filament used [mm] = 4364.38, 120.00",
      "; filament used [g] = 13.02, 0.36",
      "; total filament cost = 1.60",
      "; estimated printing time (normal mode) = 1h 5m 32s",
      "; filament_colour = #56DF3D;#FFFFFF",
      "; filament_cost = 123;0",
      "; filament_settings_id = \"Generic PLA Voolt 3D 0.4 nozzle\";\"Generic PLA\"",
      "; filament_type = PLA;PLA",
      "; printer_settings_id = Creality Ender-3 V3 0.4 nozzle",
    ].join("\n");
    const r = parseGcodeStats(gcode, 2);
    expect(r.stats).toEqual({ plate: 2, grams: [13.02, 0.36], seconds: 3932 });
    expect(r.printer).toBe("Creality Ender-3 V3 0.4 nozzle");
    expect(r.filaments[0]).toEqual({ type: "PLA", color: "#56DF3D", settingsId: "Generic PLA Voolt 3D 0.4 nozzle", costPerKg: 123 });
  });

  it("parses day/hour/minute/second durations", () => {
    expect(parseDuration("1d 2h 3m 4s")).toBe(93784);
    expect(parseDuration("45m 10s")).toBe(2710);
  });
});

describe("cost formula (Calculadora de Preço da planilha)", () => {
  it("matches the spreadsheet example: 120 g at R$ 0,1254/g, 12 h, 1 min of labour", () => {
    const c = computeCost({ grams: [120], types: ["PLA"], costPerKg: [20], seconds: 12 * 3600, printer: "Creality Ender-3 V3 0.4 nozzle" }, { ...settings, filaments: [{ type: "PLA", perKg: 125.4 }] });
    expect(c.material).toBeCloseTo(15.05, 2);
    expect(c.energy).toBeCloseTo(4.44, 2);
    expect(c.labor).toBeCloseTo(0.33, 2);
    expect(c.machine).toBe(24);
    expect(c.total).toBeCloseTo(43.82, 2);
    expect(c.price).toBeCloseTo(87.64, 2);
    expect(c.printer).toBe("Ender-3 V3");
  });

  it("adds extras and falls back to the default filament price and printer", () => {
    const c = computeCost({ grams: [10], costPerKg: [0], seconds: 0, printer: "Creality K1C 0.4 nozzle", extras: [{ name: "Argola", quantity: 2, unitCost: 0.5 }], laborMinutes: 0 }, settings);
    expect(c.material).toBe(1.2);
    expect(c.extras).toBe(1);
    expect(c.printer).toBe("Creality K1C");
  });

  it("splits the print among the objects it yields; extras and labour are per object", () => {
    const one = computeCost({ grams: [90], types: ["PLA"], costPerKg: [0], seconds: 3 * 3600, printer: "Creality Ender-3 V3 0.4 nozzle", laborMinutes: 2, extras: [{ name: "Laço", quantity: 1, unitCost: 0.5 }] }, settings);
    const nine = computeCost({ grams: [90], types: ["PLA"], costPerKg: [0], seconds: 3 * 3600, printer: "Creality Ender-3 V3 0.4 nozzle", laborMinutes: 2, extras: [{ name: "Laço", quantity: 1, unitCost: 0.5 }], units: 9 }, settings);
    expect(nine.units).toBe(9);
    expect(nine.printTotal).toBe(one.printTotal);
    expect(nine.material).toBeCloseTo(one.material / 9, 2);
    expect(nine.extras).toBe(0.5);
    expect(nine.labor).toBe(one.labor);
    expect(nine.batchTotal).toBeCloseTo(nine.total * 9, 1);
  });

  it("prices filament from the Studio table by type, not the slicer placeholder", () => {
    const settings = costSettingsSchema.parse({ filaments: [{ type: "PLA", perKg: 120 }], filamentPerKg: 150 });
    const run = (types: string[], s = settings) => computeCost({ grams: [254.95], types, costPerKg: [20], seconds: 0, printer: null, laborMinutes: 0 }, s);
    expect(run(["PLA"]).material).toBe(30.59);
    expect(run(["PLA"]).filamentPerKg).toEqual([120]);
    expect(run(["ASA"]).filamentPerKg).toEqual([150]);
    expect(run(["PLA"], { ...settings, useSlicerPrice: true }).material).toBe(5.1);
  });
});

describe("print files", () => {
  it("reads plates and profiles of a 3MF saved by the slicer", async () => {
    const info = inspect3mf(await threeMf(true));
    expect(info.configured).toBe(true);
    expect(info.printer).toBe("Creality Ender-3 V3 0.4 nozzle");
    expect(info.plates).toEqual([
      { plate: 1, name: "Vaso", thumb: "Metadata/plate_1.png" },
      { plate: 2, name: null, thumb: "Metadata/plate_2.png" },
    ]);
    expect(info.filaments[0]).toMatchObject({ type: "PLA", color: "#56DF3D", costPerKg: 123 });
  });

  it("places 3MF meshes with component and build transforms", async () => {
    const soup = threeMfTriangles(await threeMf(false));
    expect(Array.from(soup.slice(0, 6))).toEqual([105, 100, 0, 115, 100, 0]);
  });

  it("measures a single piece and only counts several pieces (they may fit into each other)", () => {
    expect(measureModel(stl(), "stl")).toEqual({ pieces: 1, size: { width: 1, depth: 1, height: 1 } });
    const one = zipSync({ "3D/3dmodel.model": strToU8(MODEL) });
    expect(measureModel(one, "3mf")).toEqual({ pieces: 1, size: { width: 10, depth: 10, height: 0 } });
    const two = zipSync({ "3D/3dmodel.model": strToU8(MODEL.replace("</build>", '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build>')) });
    expect(measureModel(two, "3mf")).toEqual({ pieces: 2, size: null });
  });

  it("reads binary STL", () => {
    expect(stlTriangles(stl()).length).toBe(4 * 9);
  });
});

describe("library folders", () => {
  it("sorts uploads: configured 3MF → fatiados, STL and raw 3MF → origem", async () => {
    const slug = lib.createProject("Vaso colmeia", { categories: ["Casa"] });
    const saved = lib.addProjectFiles(slug, [
      { name: "Vaso Colmeia Ender.3mf", data: await threeMf(true) },
      { name: "Vaso.stl", data: stl() },
      { name: "MakerWorld.3mf", data: await threeMf(false) },
    ]);
    expect(saved).toEqual(["fatiados/vasoColmeia_Ender3V3.3mf", "origem/vasoColmeia.stl", "origem/vasoColmeia.3mf"]);
    const p = lib.getProject(slug);
    expect(p.cover).toEqual({ file: "fatiados/vasoColmeia_Ender3V3.3mf", plate: 1 });
    expect(p.files.every((f) => f.standardName)).toBe(true);
    expect(p.files.find((f) => f.rel === "origem/vasoColmeia.3mf")?.slice).toEqual({ status: "not-configured" });
    expect(await lib.filePicture(slug, "origem/vasoColmeia.stl")).toBeInstanceOf(Buffer);
    expect(() => lib.projectFile(slug, "../../x")).toThrow();
  });

  it("imports from Downloads into a new project and hides imported files", () => {
    fs.writeFileSync(path.join(process.env.STUDIO_DOWNLOADS!, "Chaveiro-50-nomes.stl"), stl());
    expect(lib.listInbox().map((f) => f.name)).toEqual(["Chaveiro-50-nomes.stl"]);
    const { slug, saved } = lib.importFromInbox(["Chaveiro-50-nomes.stl"]);
    expect(slug).toBe("chaveiro-50-nomes");
    expect(saved).toEqual(["origem/chaveiro50Nomes.stl"]);
    expect(lib.listInbox()).toEqual([]);
    expect(() => lib.importFromInbox(["../segredo.stl"])).toThrow();
  });

  it("measures size, keeps sale prices per object with kits by quantity", () => {
    const slug = "vaso-colmeia";
    expect(lib.getProject(slug).object).toMatchObject({ size: { width: 10, depth: 10, height: 0 }, pieces: 1, source: "model" });
    const rel = "fatiados/vasoColmeia_Ender3V3.3mf";
    const meta = lib.readProjectMeta(slug);
    expect(lib.fileUnits({ ...meta, pieces: 3 }, rel, { pieces: 27, size: null })).toEqual({ count: 9, source: "pieces" });
    expect(lib.fileUnits({ ...meta, pieces: null }, rel, { pieces: 27, size: null })).toEqual({ count: 1, source: "default" });
    expect(lib.fileUnits({ ...meta, pieces: 4 }, rel, { pieces: 27, size: null })).toEqual({ count: 1, source: "default" });
    lib.setFileUnits(slug, rel, 6);
    expect(lib.getProject(slug).files.find((f) => f.rel === rel)?.units).toEqual({ count: 6, source: "manual" });
    lib.setFileUnits(slug, rel, null);
    lib.updateProject(slug, { size: { width: 120, depth: 80, height: 150 }, pieces: 3 });
    expect(lib.listProjects().find((p) => p.slug === slug)?.object).toMatchObject({ size: { width: 120, depth: 80, height: 150 }, pieces: 3, source: "manual" });
    lib.updateProject(slug, { salePrices: [{ quantity: 10, price: 120 }, { quantity: 1, price: 15 }, { quantity: 10, price: 110 }] });
    expect(lib.listProjects().find((p) => p.slug === slug)?.salePrices).toEqual([{ quantity: 1, price: 15 }, { quantity: 10, price: 110 }]);
    const moved = lib.moveProjectFile(slug, rel, "source");
    lib.removeProjectFile(slug, moved);
    expect(lib.readProjectMeta(slug).salePrices).toHaveLength(2);
    // older projects kept one price per file: it becomes the price of a single object
    expect(lib.projectMetaSchema.parse({ name: "x", salePrices: { "fatiados/a.3mf": 29.9 } }).salePrices).toEqual([{ quantity: 1, price: 29.9 }]);
  });

  it("moves files to the trash instead of deleting", () => {
    lib.removeProjectFile("chaveiro-50-nomes", "origem/chaveiro50Nomes.stl");
    expect(fs.existsSync(path.join(process.env.STUDIO_LIBRARY!, "chaveiro-50-nomes", ".lixeira", "chaveiro50Nomes.stl"))).toBe(true);
  });

  it("renames files to the pattern keeping cover, yield and slice cache", async () => {
    const slug = lib.createProject("Sagrada Família");
    const dir = path.join(process.env.STUDIO_LIBRARY!, slug);
    fs.writeFileSync(path.join(dir, "fatiados", "Sagrada_v2 final.3mf"), await threeMf(true));
    fs.writeFileSync(path.join(dir, "origem", "sagrada.stl"), stl());
    const before = lib.getProject(slug).files;
    expect(before.map((f) => [f.name, f.standardBase, f.standardName])).toEqual([
      ["sagrada.stl", "sagradaFamilia", false],
      ["Sagrada_v2 final.3mf", "sagradaFamilia_Ender3V3", false],
    ]);
    lib.updateProject(slug, { cover: { file: "fatiados/Sagrada_v2 final.3mf", plate: 2 }, yields: { "fatiados/Sagrada_v2 final.3mf": 4 } });
    const cached = fs.readdirSync(path.join(dir, ".studio")).length;
    expect(lib.standardizeFileNames(slug)).toEqual([
      { from: "origem/sagrada.stl", to: "origem/sagradaFamilia.stl" },
      { from: "fatiados/Sagrada_v2 final.3mf", to: "fatiados/sagradaFamilia_Ender3V3.3mf" },
    ]);
    const meta = lib.readProjectMeta(slug);
    expect(meta.cover).toEqual({ file: "fatiados/sagradaFamilia_Ender3V3.3mf", plate: 2 });
    expect(meta.yields).toEqual({ "fatiados/sagradaFamilia_Ender3V3.3mf": 4 });
    expect(fs.readdirSync(path.join(dir, ".studio")).length).toBe(cached);
    expect(lib.standardizeFileNames(slug)).toEqual([]);
  });
});

describe("file name pattern", () => {
  it("uses the project in camelCase and the printer after an underscore", async () => {
    const { camelName, printerTag, standardFileBase, followsStandard } = await import("@/lib/text");
    expect(camelName("Enfeite circular com foto e laço")).toBe("enfeiteCircularComFotoELaco");
    expect(printerTag("Creality K1 Max 0.4 nozzle")).toBe("K1Max");
    expect(printerTag("Creality Ender-3 V3 KE 0.4 nozzle")).toBe("Ender3V3KE");
    expect(printerTag("SPARKX i7")).toBe("SPARKXI7");
    expect(standardFileBase("Vaso colmeia", null)).toBe("vasoColmeia");
    expect(followsStandard("vasoColmeia_K1Max-2.3mf", "vasoColmeia_K1Max")).toBe(true);
    expect(followsStandard("vasoColmeia.3mf", "vasoColmeia_K1Max")).toBe(false);
  });
});

describe("library ↔ image studio", () => {
  it("creates the studio product once, pre-filled, and feeds its size to image prompts", async () => {
    const studio = await import("@/lib/library-studio");
    const products = await import("@/lib/products");
    const slug = lib.createProject("Porta vela");
    lib.updateProject(slug, { size: { width: 80, depth: 80, height: 95.5 }, salePrices: [{ quantity: 1, price: 24.9 }] });
    const product = studio.ensureStudioProduct(slug);
    expect(studio.ensureStudioProduct(slug)).toBe(product);
    expect(lib.readProjectMeta(slug).product).toBe(product);
    const meta = products.readMeta(product);
    expect(meta.libraryProject).toBe(slug);
    expect(meta.facts).toMatchObject({ identification: { dimensions: { width: 80, length: 80, height: 95.5, unit: "mm" } }, sale: { priceBRL: 24.9 } });
    expect(studio.promptSizeNote(slug)).toContain("80 × 80 × 95,5 mm");
    expect(studio.studioSummary(slug)).toMatchObject({ product, photos: [] });
  });
});


describe("product variations", () => {
  const ender = "Creality Ender-3 V3 0.4 nozzle";
  /** A ready file already sliced, as listFiles would return it. */
  const done = (rel: string, grams: number, seconds: number, printer = ender, units = 1) => {
    const meta = lib.projectMetaSchema.parse({ name: "x", laborMinutes: 3, extras: [{ name: "Caixa", quantity: 1, unitCost: 2 }] });
    const cost = computeCost({ grams: [grams], types: ["PLA"], costPerKg: [0], seconds, printer, extras: meta.extras, laborMinutes: 3, units }, settings);
    return {
      rel, name: rel.split("/")[1], folder: "print", type: "3mf", size: 1, modifiedAt: "", info: null, measure: { pieces: 1, size: { width: 50, depth: 50, height: 148 } },
      units: { count: units, source: "default" }, standardBase: "", standardName: true,
      slice: { status: "done", slicedAt: "", cost, stats: { plate: 1, grams: [grams], seconds, printer, filaments: [{ type: "PLA", color: "#fff", settingsId: "", costPerKg: 0 }] } },
    } as unknown as import("@/lib/library").LibraryFile;
  };

  it("adds parts printed apart, counting labour and extras once; colours change the filament cost", async () => {
    const { combineCosts, colorSurcharge } = await import("@/lib/costing");
    const body = done("fatiados/corpo.3mf", 100, 3600);
    const base = done("fatiados/base.3mf", 20, 1800);
    const c = combineCosts([body, base].map((f) => (f.slice as { cost: import("@/lib/costing").CostBreakdown }).cost), settings);
    const b = (body.slice as { cost: import("@/lib/costing").CostBreakdown }).cost;
    expect(c.material).toBeCloseTo(12 + 2.4, 2);
    expect(c.labor).toBe(b.labor);
    expect(c.extras).toBe(2);
    expect(c.total).toBeCloseTo(c.material + c.energy + c.machine + c.labor + c.extras, 2);
    expect(c.price).toBeCloseTo(c.total / (1 - settings.margin), 1);
    // 120 g in a R$ 180 roll instead of R$ 120 → R$ 7,20 more; a cheaper roll lowers it
    expect(colorSurcharge([100, 20], [120, 120], 180, settings)).toBe(7.2);
    expect(colorSurcharge([100], [120], 100, settings)).toBe(-2);
  });

  it("computes cost per variation: parts summed, other printers as alternatives, price per colour", () => {
    const files = [
      done("fatiados/vaso10_Ender3V3.3mf", 40, 3600),
      done("fatiados/vaso15_Ender3V3.3mf", 110, 9000),
      done("fatiados/vaso15_K1Max.3mf", 105, 5000, "Creality K1 Max 0.4 nozzle"),
      done("fatiados/baseRedonda_Ender3V3.3mf", 15, 1200),
    ];
    const meta = lib.projectMetaSchema.parse({
      name: "Vaso",
      laborMinutes: 3,
      extras: [{ name: "Caixa", quantity: 1, unitCost: 2 }],
      colors: [{ name: "Dourado seda", perKg: 180 }, { name: "Branco" }],
      variations: [
        { id: "10-cm", title: "10 cm", files: ["fatiados/vaso10_Ender3V3.3mf"] },
        { id: "15-cm", title: "15 cm", files: ["fatiados/vaso15_Ender3V3.3mf", "fatiados/vaso15_K1Max.3mf"] },
        { id: "10-cm-base", title: "10 cm base redonda", files: ["fatiados/vaso10_Ender3V3.3mf", "fatiados/baseRedonda_Ender3V3.3mf"] },
        { id: "vazia", title: "Nova" },
      ],
    });
    const [small, big, withBase, empty] = lib.variationViews(meta, files, settings);
    const plain = (f: (typeof files)[number]) => (f.slice as { cost: import("@/lib/costing").CostBreakdown }).cost;
    expect(small).toMatchObject({ status: "done", grams: 40, seconds: 3600, measured: { height: 148 } });
    expect(small.cost?.total).toBe(plain(files[0]).total);
    expect(big.options.map((o) => o.printer)).toEqual(["Ender-3 V3", "Creality K1 Max"]);
    expect(big.cost?.total).toBe(plain(files[1]).total);
    expect(withBase.grams).toBe(55);
    expect(withBase.measured).toBeNull();
    expect(withBase.cost!.total).toBeCloseTo(plain(files[0]).total + plain(files[3]).total - plain(files[3]).labor - plain(files[3]).extras, 1);
    // only colours with their own roll price; 40 g × (180 − 120) / 1000 = R$ 2,40 more
    expect(small.colors).toEqual([{ name: "Dourado seda", perKg: 180, surcharge: 2.4, total: expect.closeTo(small.cost!.total + 2.4, 2), price: expect.any(Number) }]);
    expect(small.colors[0].price).toBeGreaterThan(small.cost!.price);
    expect(empty).toMatchObject({ status: "empty", cost: null, colors: [] });
  });

  it("adds, edits and removes variations; files follow renames and the trash", async () => {
    const slug = lib.createProject("Luminária lua");
    const dir = path.join(process.env.STUDIO_LIBRARY!, slug);
    fs.writeFileSync(path.join(dir, "fatiados", "lua 10.3mf"), await threeMf(true));
    fs.writeFileSync(path.join(dir, "fatiados", "lua 15.3mf"), await threeMf(true));
    lib.updateProject(slug, { salePrices: [{ quantity: 1, price: 39.9 }] });
    // older projects have no variations: a single product
    expect(lib.getProject(slug)).toMatchObject({ variations: [], colors: [] });
    expect(lib.getProject(slug).single).toMatchObject({ id: "unico", files: ["fatiados/lua 10.3mf"] });

    const first = lib.addVariation(slug, { title: "10 cm", files: ["fatiados/lua 10.3mf"] });
    expect(first).toMatchObject({ id: "10-cm", size: "10 cm", feature: "", salePrices: [{ quantity: 1, price: 39.9 }] });
    const second = lib.addVariation(slug, { title: "15cm base redonda", files: ["fatiados/lua 15.3mf"] });
    expect(second).toMatchObject({ id: "15cm-base-redonda", size: "15 cm", feature: "Base redonda", salePrices: [] });
    expect(lib.addVariation(slug, { title: "10 cm" }).id).toBe("10-cm-2");
    expect(() => lib.addVariation(slug, { title: "x", files: ["fatiados/nao-existe.3mf"] })).toThrow();
    expect(lib.getProject(slug).single).toBeNull();

    // a new title refreshes labels derived from it, but not ones set by hand
    expect(lib.updateVariation(slug, "15cm-base-redonda", { title: "20 cm base quadrada" })).toMatchObject({ id: "15cm-base-redonda", size: "20 cm", feature: "Base quadrada" });
    lib.updateVariation(slug, "10-cm", { feature: "Lisa" });
    expect(lib.updateVariation(slug, "10-cm", { title: "12 cm" })).toMatchObject({ size: "12 cm", feature: "Lisa" });
    lib.updateVariation(slug, "10-cm", { files: ["fatiados/lua 10.3mf", "fatiados/lua 15.3mf", "fatiados/lua 10.3mf"] });
    expect(lib.readProjectMeta(slug).variations[0].files).toEqual(["fatiados/lua 10.3mf", "fatiados/lua 15.3mf"]);

    lib.standardizeFileNames(slug);
    const renamed = lib.readProjectMeta(slug).variations;
    expect(renamed[0].files.every((f) => f.startsWith("fatiados/luminariaLua_Ender3V3"))).toBe(true);
    lib.removeProjectFile(slug, renamed[1].files[0]);
    expect(lib.readProjectMeta(slug).variations[1].files).toEqual([]);
    expect(lib.readProjectMeta(slug).variations[0].files).toHaveLength(1);

    lib.removeVariation(slug, "10-cm-2");
    expect(lib.readProjectMeta(slug).variations.map((v) => v.id)).toEqual(["10-cm", "15cm-base-redonda"]);
    expect(() => lib.removeVariation(slug, "10-cm-2")).toThrow();
  });

  it("is exposed as actions (MCP tools)", async () => {
    const { runAction, ACTIONS } = await import("@/lib/actions");
    const slug = lib.createProject("Porta caneta");
    const v = await runAction(ACTIONS.add_library_variation, { project: slug, title: "Base hexagonal" });
    expect(v).toMatchObject({ id: "base-hexagonal", feature: "Base hexagonal" });
    await runAction(ACTIONS.update_library_project, { project: slug, colors: [{ name: "Glitter", perKg: 160 }] });
    expect(lib.getProject(slug)).toMatchObject({ colors: [{ name: "Glitter", perKg: 160 }], variations: [{ id: "base-hexagonal", status: "empty" }] });
    await runAction(ACTIONS.remove_library_variation, { project: slug, variation: "base-hexagonal" });
    expect(lib.readProjectMeta(slug).variations).toEqual([]);
  });
});
