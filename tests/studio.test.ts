import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { JobParams } from "@/lib/prompts";

// Point the app at a throwaway folder before any module reads the paths.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-test-"));
process.env.STUDIO_ROOT = root;
fs.cpSync(path.join(__dirname, "..", "config"), path.join(root, "config"), { recursive: true });

const products = await import("@/lib/products");
const { renderTarget, exportImages, defaultMode } = await import("@/lib/export");
const { buildPrompt, jobInputIds } = await import("@/lib/prompts");
const { expandRequest } = await import("@/lib/jobs");
const { db } = await import("@/lib/db");

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#e88" } }).png().toBuffer();

describe("folders ⇄ database", () => {
  let slug: string;
  beforeAll(() => {
    slug = products.createProduct("Porta-guardanapo Laço");
  });

  it("creates the product folder under create/", () => {
    expect(slug).toBe("porta-guardanapo-laco");
    expect(fs.existsSync(path.join(root, "products/create", slug, "real"))).toBe(true);
  });

  it("indexes uploads and files dropped by hand", async () => {
    products.saveUpload(slug, "real", "Foto 1.PNG", await png(40, 30));
    fs.writeFileSync(path.join(root, "products/create", slug, "style-refs/mesa.png"), await png(40, 30));
    const p = products.getProduct(slug);
    expect(p.images.map((i) => [i.kind, i.rel]).sort()).toEqual([
      ["real", "real/foto-1.png"],
      ["style", "style-refs/mesa.png"],
    ]);
  });

  it("approves a candidate into approved/ and exports it", async () => {
    const dir = path.join(root, "products/create", slug);
    fs.mkdirSync(path.join(dir, "generated"), { recursive: true });
    fs.writeFileSync(path.join(dir, "generated/job1.png"), await png(1024, 1536));
    const genId = products.registerImage(slug, "generated/job1.png", "generated", { label: "fundo-branco", jobId: "job1" });

    const approvedId = products.approveImage(genId);
    expect(fs.existsSync(path.join(dir, "approved/fundo-branco-job1.png"))).toBe(true);

    await exportImages({ imageIds: [approvedId], marketplace: "shopee", targetIds: ["1x1", "3x4"] });
    const m11 = await sharp(path.join(dir, "exports/shopee/1x1/fundo-branco-job1.jpg")).metadata();
    const m34 = await sharp(path.join(dir, "exports/shopee/3x4/fundo-branco-job1.jpg")).metadata();
    expect([m11.width, m11.height]).toEqual([1200, 1200]);
    expect([m34.width, m34.height]).toEqual([1200, 1600]);

    // Un-approving removes the approved copy and its exports.
    products.setCandidateStatus(genId, "pending");
    expect(fs.existsSync(path.join(dir, "approved/fundo-branco-job1.png"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "exports/shopee/1x1/fundo-branco-job1.jpg"))).toBe(false);
  });

  it("moves the folder to ready/ and back", () => {
    products.moveProduct(slug, "ready");
    expect(fs.existsSync(path.join(root, "products/ready", slug))).toBe(true);
    expect(products.getProduct(slug).stage).toBe("ready");
    products.moveProduct(slug, "create");
    expect(products.getProduct(slug).stage).toBe("create");
  });

  it("drops rows for files deleted by hand", () => {
    fs.rmSync(path.join(root, "products/create", slug, "style-refs/mesa.png"));
    products.syncProduct(slug);
    const rows = db().prepare("SELECT rel FROM images WHERE product = ? AND kind = 'style'").all(slug);
    expect(rows).toEqual([]);
  });

  it("rejects paths escaping the product folder", () => {
    expect(() => products.productFile(slug, "../../config/filaments.json")).toThrow();
  });
});

describe("export", () => {
  it("detects white-background packshots", async () => {
    const packshot = path.join(root, "packshot.png");
    await sharp({ create: { width: 200, height: 200, channels: 3, background: "#fff" } })
      .composite([{ input: await png(100, 100), left: 50, top: 50 }])
      .png()
      .toFile(packshot);
    const scene = path.join(root, "scene.png");
    fs.writeFileSync(scene, await png(200, 200));
    expect(await defaultMode(packshot)).toBe("pad");
    expect(await defaultMode(scene)).toBe("crop");
  });

  it("pads and crops to the exact target size", async () => {
    const input = path.join(root, "wide.png");
    fs.writeFileSync(input, await png(300, 100));
    for (const mode of ["pad", "crop"] as const) {
      const out = path.join(root, `out-${mode}.jpg`);
      await renderTarget(input, out, 1200, 1600, mode);
      const m = await sharp(out).metadata();
      expect([m.width, m.height, m.format]).toEqual([1200, 1600, "jpeg"]);
    }
  });
});

describe("prompts", () => {
  const meta = { name: "Topo Carrossel", description: "", fidelityNotes: "Manter 'Amália'", marketplaces: ["shopee"] };
  const filament = (id: string) => ({ id, name: "Azul", line: "PLA", hex: "#1F4FB4" });

  it("orders inputs products first, then style refs", () => {
    const p: JobParams = { type: "scene", productImageIds: [1, 2], styleImageIds: [9], aspect: "1:1" };
    expect(jobInputIds(p)).toEqual([1, 2, 9]);
    const { prompt, label } = buildPrompt(p, { meta, filament });
    expect(label).toBe("cenario");
    expect(prompt).toContain("images 1–2");
    expect(prompt).toContain("image 3 is the STYLE");
    expect(prompt).toContain("Manter 'Amália'");
    expect(prompt).toContain("./output.png");
  });

  it("describes filament colors in recolor prompts", () => {
    const { prompt, label } = buildPrompt(
      { type: "recolor", sourceImageId: 5, colors: [{ part: "partes rosa", filamentId: "azul" }] },
      { meta, filament },
    );
    expect(label).toBe("cor-azul");
    expect(prompt).toContain("partes rosa → Azul (PLA, color #1F4FB4)");
  });

  it("expands recolor requests into one job per combination", () => {
    const jobs = expandRequest({
      type: "recolor",
      sourceImageId: 1,
      colors: [
        { part: "rosa", filamentIds: ["azul", "verde"] },
        { part: "dourado", filamentIds: ["preto"] },
        { part: "ignorada", filamentIds: [] },
      ],
    });
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => (j.type === "recolor" ? j.colors.map((c) => c.filamentId) : []))).toEqual([
      ["azul", "preto"],
      ["verde", "preto"],
    ]);
  });
});
