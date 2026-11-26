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
const { inspect3mf, measureModel, measureModelFile, modelMeshesFile, plateImage, stlTriangles, threeMfItems, threeMfTriangles } = await import("@/lib/print-files");
const { Zip } = await import("@/lib/zip");
const { rasterize } = await import("@/lib/raster");
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

  it("measures size, keeps sale prices per object with kits by quantity", async () => {
    await lib.whenIdle();
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

// ------------------------------------------------------------------------------------- light reading of big files

/** A Creality/Bambu-style 3MF: the root only places objects; each mesh lives in its own part under 3D/Objects. */
function splitModel(items: number, mesh: string) {
  const build = Array.from({ length: items }, (_, i) => `<item objectid="10" transform="1 0 0 0 1 0 0 0 1 ${i * 50} 0 0"/>`).join("");
  return zipSync({
    "3D/3dmodel.model": strToU8(`<model xmlns:p="p"><resources><object id="10" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="2 0 0 0 1 0 0 0 1 0 0 3"/></components></object></resources><build>${build}</build></model>`),
    "3D/Objects/object_1.model": strToU8(mesh),
  });
}
const MESH = `<model><resources><object id="1" type="model"><mesh><vertices>
<vertex x="0" y="0" z="0"/><vertex y='4' x="1e1" z="-0"/><vertex x="-2.5" y="0" z="7.25E+0"/>
</vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources></model>`;

describe("light reading of print files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "print-files-"));
  const write = (name: string, data: Uint8Array) => (fs.writeFileSync(path.join(dir, name), data), path.join(dir, name));

  it("reads single zip entries from disk, stored or deflated", async () => {
    const file = write("a.3mf", zipSync({ "a.txt": [strToU8("olá"), { level: 0 }], "b/c.txt": strToU8("x".repeat(10_000)) }));
    const zip = new Zip(file);
    try {
      expect(zip.names()).toEqual(["a.txt", "b/c.txt"]);
      expect(zip.text("a.txt")).toBe("olá");
      expect(zip.read("b/c.txt")?.length).toBe(10_000);
      expect(zip.read("nope")).toBeNull();
    } finally {
      zip.close();
    }
    expect(() => new Zip(write("broken.3mf", strToU8("not a zip")))).toThrow();
  });

  it("gives the same profiles and plate picture from a path as from bytes", async () => {
    const data = await threeMf(true);
    const file = write("configured.3mf", data);
    expect(inspect3mf(file)).toEqual(inspect3mf(data));
    expect(plateImage(file, "Metadata/plate_1.png")?.equals(plateImage(data, "Metadata/plate_1.png")!)).toBe(true);
  });

  it("parses vertices in any attribute order, quotes and number format", () => {
    const soup = threeMfItems(splitModel(1, MESH))[0];
    // object scaled ×2 on x and raised 3 mm by the component
    expect(Array.from(soup)).toEqual([0, 0, 3, 20, 4, 3, -5, 0, 10.25]);
  });

  it("counts several pieces without reading their meshes", async () => {
    // A broken mesh part would make the parse fail if it were read; with 3 pieces it never is.
    const many = splitModel(3, "<model><resources><object id=\"1\"><mesh><vertices><vertex x=\"oops");
    expect(measureModel(many, "3mf")).toEqual({ pieces: 3, size: null });
    expect(await measureModelFile(write("many.3mf", many), "3mf")).toEqual({ pieces: 3, size: null });
  });

  it("measures a single piece from disk like from bytes, through components in other parts", async () => {
    const one = splitModel(1, MESH);
    expect(measureModel(one, "3mf")).toEqual({ pieces: 1, size: { width: 25, depth: 4, height: 7.3 } });
    expect(await measureModelFile(write("one.3mf", one), "3mf")).toEqual(measureModel(one, "3mf"));
    expect(await measureModelFile(write("one.stl", stl()), "stl")).toEqual({ pieces: 1, size: { width: 1, depth: 1, height: 1 } });
  });

  it("draws indexed meshes exactly like the same triangle soup", async () => {
    const [mesh] = await modelMeshesFile(write("draw.3mf", splitModel(1, MESH)), "3mf");
    expect(mesh.index).toBeInstanceOf(Uint32Array);
    const view = { azimuth: -30, elevation: 32 };
    const o = { width: 64, height: 64, background: "#ffffff" };
    const indexed = rasterize([{ ...mesh, color: "#c9a132" }], view, o);
    const soup = rasterize([{ soup: threeMfTriangles(splitModel(1, MESH)), color: "#c9a132" }], view, o);
    expect(Buffer.from(indexed).equals(Buffer.from(soup))).toBe(true);
    expect(indexed.some((v, i) => i % 4 === 0 && v !== 255)).toBe(true);
  });
});

describe("library background work", () => {
  it("measures new files in the background, once per version", async () => {
    const slug = lib.createProject("Presépio grande");
    lib.addProjectFiles(slug, [{ name: "presepio.3mf", data: splitModel(1, MESH) }]);
    const first = lib.getProject(slug).files[0];
    expect(first.measuring).toBe(true);
    expect(first.measure).toBeNull();
    await lib.whenIdle();
    const after = lib.getProject(slug).files[0];
    expect(after).toMatchObject({ measuring: false, measure: { pieces: 1, size: { width: 25, depth: 4, height: 7.3 } } });
    expect(lib.listProjects().find((p) => p.slug === slug)?.calculating).toBe(false);
  });

  it("keeps pictures on disk per file version and width, dropping older versions", async () => {
    const slug = lib.createProject("Foto em cache");
    const [rel] = lib.addProjectFiles(slug, [{ name: "x.3mf", data: await threeMf(true) }]);
    const pics = path.join(process.env.STUDIO_LIBRARY!, slug, ".studio", "pictures");
    const png = await lib.filePicture(slug, rel, 1, 4);
    expect((await sharp(png).metadata()).width).toBe(4);
    expect(fs.readdirSync(pics)).toHaveLength(1);
    expect((await lib.filePicture(slug, rel, 1, 4)).equals(png)).toBe(true);
    await lib.filePicture(slug, rel, 2, 0);
    expect(fs.readdirSync(pics)).toHaveLength(2);
    // the file is saved again: new pictures, the old ones go away
    const abs = lib.projectFile(slug, rel);
    fs.utimesSync(abs, new Date(), new Date(Date.now() + 5000));
    await lib.filePicture(slug, rel, 1, 4);
    expect(fs.readdirSync(pics)).toHaveLength(1);
    // a model without plate pictures is rendered once, then served from disk
    const [stlRel] = lib.addProjectFiles(slug, [{ name: "x.stl", data: stl() }]);
    const render = await lib.filePicture(slug, stlRel, 1, 32);
    expect((await sharp(render).metadata()).width).toBe(32);
    expect(fs.readdirSync(pics).filter((f) => f.endsWith("-render.png"))).toHaveLength(1);
  });

  it("slices one file at a time, on disk, and computes the cost", async () => {
    const { setSlicerSettings } = await import("@/lib/slicer");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-slicer-"));
    const log = path.join(dir, "slicer.log");
    const fake = path.join(dir, "CrealityPrint-fake.sh");
    fs.writeFileSync(fake, [
      "#!/bin/sh",
      `echo "start $4" >> "${log}"`,
      "sleep 0.3",
      `printf '; filament used [g] = 12.5\\n; estimated printing time (normal mode) = 1h 0m 0s\\n; filament_type = PLA\\n; filament_colour = #FFFFFF\\n; filament_cost = 100\\n; printer_settings_id = Creality Ender-3 V3 0.4 nozzle\\n' > "$4/plate_1.gcode"`,
      `echo "end" >> "${log}"`,
    ].join("\n"));
    fs.chmodSync(fake, 0o755);
    setSlicerSettings({ path: fake });
    try {
      const slug = lib.createProject("Fila de fatiamento");
      lib.addProjectFiles(slug, [{ name: "a.3mf", data: await threeMf(true) }, { name: "b.3mf", data: await threeMf(true) }]);
      const files = lib.getProject(slug).files;
      expect(files.map((f) => f.slice?.status)).toEqual(["queued", "queued"]);
      await lib.whenIdle();
      const lines = fs.readFileSync(log, "utf8").trim().split("\n");
      // never two slices at once: start, end, start, end
      expect(lines.map((l) => l.split(" ")[0])).toEqual(["start", "end", "start", "end"]);
      // the G-code goes to the app's data folder (on disk), not the system temp folder (often in memory)
      expect(lines[0]).toContain(path.join(process.env.STUDIO_ROOT!, "data", "slicing"));
      expect(fs.readdirSync(path.join(process.env.STUDIO_ROOT!, "data", "slicing"))).toEqual([]);
      const done = lib.getProject(slug).files.map((f) => f.slice);
      expect(done.every((s) => s?.status === "done")).toBe(true);
      const s = done[0]!;
      if (s.status !== "done") throw new Error("not done");
      expect(s.stats).toMatchObject({ grams: [12.5], seconds: 3600 });
      expect(s.cost.total).toBeGreaterThan(0);
      // the same version is not sliced again
      lib.getProject(slug);
      await lib.whenIdle();
      expect(fs.readFileSync(log, "utf8").trim().split("\n")).toHaveLength(4);
    } finally {
      setSlicerSettings({ path: "" });
    }
  });
});
