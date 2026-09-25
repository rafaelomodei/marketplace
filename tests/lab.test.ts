import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { LAB_FONTS } from "@/lib/lab/fonts";
import { parseStl } from "@/lib/lab/mesh";
import { defaultValues, paramsSchema, scadDefines } from "@/lib/lab/params";
import { renderTool } from "@/lib/lab/server";
import { keychain } from "@/lib/lab/tools/keychain";

describe("lab: chaveiro", () => {
  it("renders base and letters as separate parts with a two-color 3MF", async () => {
    const r = await renderTool("chaveiro", { text: "Amália", ring: "right" });
    expect(parseStl(r.parts.base).length).toBeGreaterThan(1000);
    expect(parseStl(r.parts.text).length).toBeGreaterThan(1000);
    const [w, , h] = r.size!;
    expect(w).toBeGreaterThan(50);
    expect(h).toBeCloseTo(3 + 1.6, 1);

    const files = unzipSync(r.file3mf!);
    const model = strFromU8(files["3D/3dmodel.model"]);
    expect(model.match(/<object /g)).toHaveLength(3); // two parts + the object that groups them
    expect(model).toContain('displaycolor="#FC8CD5FF"');
  }, 30000);

  it("adds the top line and the icon as their own parts", async () => {
    const one = await renderTool("chaveiro", { text: "Débora" });
    expect(Object.keys(one.parts)).toEqual(["base", "text"]);

    const r = await renderTool("chaveiro", { text: "Débora", top_text: "Professora", icon: "heart", ring: "top" });
    expect(Object.keys(r.parts)).toEqual(["base", "text", "top", "icon"]);
    for (const part of ["top", "icon"]) expect(parseStl(r.parts[part]).length, part).toBeGreaterThan(500);
    expect(r.size![1]).toBeGreaterThan(one.size![1] + 5); // taller: two lines + the ring on top
    expect(strFromU8(unzipSync(r.file3mf!)["3D/3dmodel.model"]).match(/<object /g)).toHaveLength(5);
  }, 30000);

  it("raising the icon keeps it next to the letters at its height", async () => {
    const minX = (stl: Uint8Array) => Math.min(...parseStl(stl).filter((_, i) => i % 3 === 0));
    const at = (icon_offset_y: number) => renderTool("chaveiro", { text: "Débora", top_text: "Professora", icon: "heart", icon_offset_y });
    const [low, high] = await Promise.all([at(-2), at(12)]);
    // beside the name it starts after the name; up by the top line (shorter) it moves in to meet it
    expect(minX(high.parts.icon)).toBeLessThan(minX(low.parts.icon) - 5);
    const topEnd = Math.max(...parseStl(high.parts.top).filter((_, i) => i % 3 === 0));
    expect(minX(high.parts.icon)).toBeGreaterThan(topEnd);
    expect(minX(high.parts.icon) - topEnd).toBeLessThan(3);
  }, 30000);

  it("single-color mode: pockets in the base and taller pieces that fit them", async () => {
    const values = { text: "Débora", top_text: "Professora", icon: "heart", print_mode: "single", separate: "text,icon" };
    const multi = await renderTool("chaveiro", { ...values, print_mode: "multi" });
    const r = await renderTool("chaveiro", values);
    expect(r.file3mf).toBeNull();
    // base with the top line fused on it + the name and the icon as separate pieces
    expect(r.files.map((f) => f.label)).toEqual(["Base com encaixes", "Nome (peça de encaixe)", "Ícone (peça de encaixe)"]);
    const zMin = (stl: Uint8Array) => Math.min(...parseStl(stl).filter((_, i) => i % 3 === 2));
    const zMax = (stl: Uint8Array) => Math.max(...parseStl(stl).filter((_, i) => i % 3 === 2));
    expect(zMin(r.parts.text)).toBeCloseTo(3 - 1, 3); // starts at the bottom of the 1 mm pocket
    expect(zMax(r.parts.text)).toBeCloseTo(zMax(multi.parts.text), 3); // same relief once fitted
    expect(zMin(r.parts.top)).toBeCloseTo(3, 3); // not separated: stays on top of the base
    expect(r.parts.base.length).toBeGreaterThan(multi.parts.base.length); // the pockets add faces
    // the base file merges the base with the fused top line
    expect(parseStl(r.files[0].data).length).toBe(parseStl(r.parts.base).length + parseStl(r.parts.top).length);
    await expect(renderTool("chaveiro", { ...values, base_thickness: 1.4, pocket_depth: 1 })).rejects.toMatchObject({ status: 400 });
  }, 60000);

  it("renders every icon", async () => {
    const { LAB_ICONS } = await import("@/lib/lab/fonts");
    for (const icon of LAB_ICONS) {
      const r = await renderTool("chaveiro", { text: "A", icon: icon.id, ring: "none" });
      expect(parseStl(r.parts.icon).length, icon.id).toBeGreaterThan(100);
    }
  }, 120000);

  it("renders every bundled font", async () => {
    for (const f of LAB_FONTS) {
      const r = await renderTool("chaveiro", { text: "Ana", font: f.family, ring: "none" });
      expect(r.size![0], f.family).toBeGreaterThan(10);
    }
  }, 60000);

  it("rejects values that cannot be printed", async () => {
    await expect(renderTool("chaveiro", { text: "Ana", ring_diameter: 6, hole_diameter: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(renderTool("chaveiro", { text: "x".repeat(31) })).rejects.toMatchObject({ status: 400 });
    await expect(renderTool("topo-de-bolo", {})).rejects.toMatchObject({ status: 404 });
  });

  it("quotes strings safely for OpenSCAD", () => {
    expect(scadDefines({ text: 'Ana "Bia"', size: 2 })).toEqual(["-D", 'text="Ana \\"Bia\\""', "-D", "size=2"]);
    expect(paramsSchema(keychain.params!).parse({})).toEqual(defaultValues(keychain.params!));
  });
});

describe("lab actions", async () => {
  const { callAction } = await import("@/lib/actions");
  it("lists tools without the model source and renders through the action", async () => {
    const list = (await callAction("list_lab_tools", {})) as { tools: { id: string; source?: string }[] };
    expect(list.tools.find((t) => t.id === "chaveiro")).toBeDefined();
    expect(list.tools.every((t) => t.source === undefined)).toBe(true);
    const r = (await callAction("render_lab_model", { tool: "chaveiro", values: { text: "Bia" } })) as { fileName: string; file3mfBase64: string; stlFiles: unknown[] };
    expect(r.stlFiles).toHaveLength(2);
    expect(r.fileName).toBe("chaveiro-bia.3mf");
    expect(r.file3mfBase64.length).toBeGreaterThan(1000);
  }, 30000);
});

describe("lab: etiqueta de bolsa", () => {
  it("renders the tag with its strap and snap pin, letters as fit pieces by default", async () => {
    const r = await renderTool("etiqueta-de-bolsa", { text: "Sérgio" });
    const [w, , h] = r.size!;
    expect(w).toBeGreaterThan(100 + 40); // strap (100 mm) + the name
    // the snap pin (strap 1.2 + stem 1.6 + flare 0.65 + tip 1.4) is a bit taller than the tag (3 + 1.6)
    expect(h).toBeCloseTo(1.2 + 1.6 + 0.65 + 1.4, 2);
    expect(r.file3mf).toBeNull(); // single-color by default
    expect(r.files.map((f) => f.label)).toEqual(["Etiqueta e alça com encaixes", "Nome (peça de encaixe)"]);
    // the strap is thin: at its tip the base is only strap_thickness tall
    const base = parseStl(r.parts.base);
    let tipZ = 0;
    const minX = Math.min(...base.filter((_, i) => i % 3 === 0));
    for (let i = 0; i < base.length; i += 3) if (base[i] < minX + 3) tipZ = Math.max(tipZ, base[i + 2]);
    expect(tipZ).toBeCloseTo(1.2, 3);
  }, 30000);

  it("rejects a hole too big for the strap and a strap too short", async () => {
    await expect(renderTool("etiqueta-de-bolsa", { text: "Ana", strap_width: 6, pin_diameter: 4 })).rejects.toMatchObject({ status: 400 });
    await expect(renderTool("etiqueta-de-bolsa", { text: "Ana", strap_length: 50, pin_distance: 30 })).rejects.toMatchObject({ status: 400 });
  });
});
