import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Point the app at a throwaway folder before any module reads the paths.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-lab-studio-"));
process.env.STUDIO_ROOT = root;
fs.cpSync(path.join(__dirname, "..", "config"), path.join(root, "config"), { recursive: true });
fs.symlinkSync(path.join(__dirname, "..", "public"), path.join(root, "public")); // the Lab fonts

const { callAction } = await import("@/lib/actions");
const products = await import("@/lib/products");
const { expandRequest } = await import("@/lib/jobs");
const { buildPrompt } = await import("@/lib/prompts");
const { findFilament } = await import("@/lib/config");
const { db, now } = await import("@/lib/db");

type Summary = { id: string; product: string | null };

describe("lab → studio (mockup)", () => {
  it("renders the 3D pictures on the server and makes a product with the real colors and size", async () => {
    const c = (await callAction("save_lab_creation", { tool: "chaveiro", values: { text: "Rafael" } })) as Summary;
    const r = (await callAction("send_lab_creation_to_studio", { id: c.id })) as { slug: string; created: boolean; pictures: number };
    expect(r).toMatchObject({ slug: "rafael", created: true, pictures: 4 });

    const p = products.getProduct(r.slug);
    const renders = p.images.filter((i) => i.kind === "render");
    expect(renders).toHaveLength(4);
    expect(p.meta.lab).toMatchObject({ tool: "chaveiro", creation: c.id });
    expect(p.meta.lab!.parts.map((x) => x.label)).toEqual(["Base", "Nome"]);
    expect(p.meta.lab!.parts.every((x) => x.filamentId)).toBe(true); // closest real filament when none was picked
    expect(p.meta.lab!.sizeMm![0]).toBeGreaterThan(40);
    expect(p.meta.fidelityNotes).toContain('"Rafael"');
    expect(((await callAction("get_lab_creation", { id: c.id })) as Summary).product).toBe(r.slug);
    expect(await callAction("get_next_step", { slug: r.slug })).toMatchObject({ step: "create", cta: "Criar fotos reais" });

    // again: same product, fresh 3D pictures
    const again = (await callAction("send_lab_creation_to_studio", { id: c.id })) as { slug: string; created: boolean };
    expect(again).toMatchObject({ slug: r.slug, created: false });
    expect(products.getProduct(r.slug).images.filter((i) => i.kind === "render")).toHaveLength(4);
  }, 60000);

  it("one photo job per 3D picture, with the real filaments and size in the prompt", async () => {
    const p = products.getProduct("rafael");
    const ids = p.images.filter((i) => i.kind === "render").map((i) => i.id);
    const jobs = expandRequest({ type: "from-3d", renderImageIds: ids });
    expect(jobs).toHaveLength(4);
    expect(jobs[1]).toMatchObject({ renderImageId: ids[1], otherRenderIds: [ids[0], ids[2], ids[3]] });

    const { prompt, label } = buildPrompt(jobs[0], { meta: p.meta, filament: findFilament, skill: "SKILL" });
    expect(label).toBe("foto-do-3d");
    expect(prompt).toContain("MODELO 3D");
    expect(prompt).toContain("Tamanho real da peça");
    expect(prompt).toContain(findFilament(p.meta.lab!.parts[0].filamentId!)!.name);

    const staged = buildPrompt({ type: "staged", productImageIds: [1], setting: "no zíper de uma mochila", aspect: "1:1" }, { meta: p.meta, filament: findFilament, skill: "" });
    expect(staged.prompt).toContain("CENA: no zíper de uma mochila");
  });

  it("an approved photo from the 3D also becomes a product photo; un-approving takes it back", async () => {
    const slug = "rafael";
    const render = products.getProduct(slug).images.find((i) => i.kind === "render")!;
    db().prepare("INSERT INTO jobs (id, product, type, label, params, prompt, status, created_at) VALUES ('j3d', ?, 'from-3d', 'foto-do-3d', '{}', '', 'done', ?)").run(slug, now());
    const { dir } = products.requireProduct(slug);
    fs.mkdirSync(path.join(dir, "generated"), { recursive: true });
    fs.copyFileSync(products.imagePath(render), path.join(dir, "generated", "j3d.png"));
    const candidate = products.registerImage(slug, "generated/j3d.png", "generated", { label: "foto-do-3d", jobId: "j3d", parentId: render.id });

    products.approveImage(candidate);
    const real = products.getProduct(slug).images.filter((i) => i.kind === "real");
    expect(real).toHaveLength(1);
    expect(await callAction("get_next_step", { slug })).toMatchObject({ step: "publish" });

    products.setCandidateStatus(candidate, "pending");
    expect(products.getProduct(slug).images.filter((i) => i.kind === "real")).toHaveLength(0);
  });
});
