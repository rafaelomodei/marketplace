import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Point the app at a throwaway folder before any module reads the paths.
process.env.STUDIO_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "studio-lab-"));

const { callAction } = await import("@/lib/actions");
const { creationName, creationThumbnail } = await import("@/lib/lab/creations");
const { findTool } = await import("@/lib/lab/tools");

type Summary = { id: string; name: string; hasThumbnail: boolean; updatedAt: string };
const png = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");

describe("lab: saved creations (history)", () => {
  it("creates, updates and reopens a piece; the name comes from the text typed", async () => {
    const a = (await callAction("save_lab_creation", { tool: "chaveiro", values: { text: "Amália" } })) as Summary;
    expect(a.name).toBe("Amália");
    expect(a.hasThumbnail).toBe(false);

    const colors = { base: { filamentId: null, hex: "#ffffff" } };
    const b = (await callAction("save_lab_creation", { id: a.id, tool: "chaveiro", values: { text: "Débora", ring: "top" }, colors, thumbnail: png })) as Summary;
    expect(b).toMatchObject({ id: a.id, name: "Débora", hasThumbnail: true });

    const full = (await callAction("get_lab_creation", { id: a.id })) as { values: object; colors: object };
    expect(full.values).toEqual({ text: "Débora", ring: "top" });
    expect(full.colors).toEqual(colors);
    expect(creationThumbnail(a.id)?.[0]).toBe(0x89);

    // saving again without a picture keeps the old one
    await callAction("save_lab_creation", { id: a.id, tool: "chaveiro", values: { text: "Débora" } });
    expect(creationThumbnail(a.id)).not.toBeNull();
  });

  it("lists per tool, most recent first; copies and deletes", async () => {
    const tag = (await callAction("save_lab_creation", { tool: "etiqueta-de-bolsa", values: { text: "Leo" } })) as Summary;
    const key = (await callAction("save_lab_creation", { tool: "chaveiro", values: { text: "Zé" } })) as Summary;
    const list = async (tool: string) => ((await callAction("list_lab_creations", { tool })) as { creations: Summary[] }).creations;

    expect((await list("etiqueta-de-bolsa")).map((c) => c.id)).toEqual([tag.id]);
    expect((await list("chaveiro"))[0].id).toBe(key.id);

    const copy = (await callAction("duplicate_lab_creation", { id: key.id })) as Summary;
    expect(copy.id).not.toBe(key.id);
    expect(copy.name).toBe("Zé");
    expect((await list("chaveiro"))[0].id).toBe(copy.id);

    await callAction("delete_lab_creation", { id: copy.id });
    expect((await list("chaveiro")).some((c) => c.id === copy.id)).toBe(false);
    await expect(callAction("get_lab_creation", { id: copy.id })).rejects.toThrow(/não encontrada/);
  });

  it("refuses unknown tools, another tool's piece and bad thumbnails", async () => {
    await expect(callAction("save_lab_creation", { tool: "topo-de-bolo", values: {} })).rejects.toThrow(/não encontrada/);
    const a = (await callAction("save_lab_creation", { tool: "chaveiro", values: { text: "Ana" } })) as Summary;
    await expect(callAction("save_lab_creation", { id: a.id, tool: "etiqueta-de-bolsa", values: {} })).rejects.toThrow(/outra ferramenta/);
    await expect(callAction("save_lab_creation", { tool: "chaveiro", values: {}, thumbnail: "data:text/html;base64,PGI+" })).rejects.toThrow(/Miniatura/);
  });

  it("keeps a typed name until it is cleared; copies say so", async () => {
    type Named = Summary & { customName: boolean };
    const a = (await callAction("save_lab_creation", { tool: "chaveiro", values: { text: "Ana" } })) as Named;
    const r = (await callAction("rename_lab_creation", { id: a.id, name: "  Presente da vó  " })) as Named;
    expect(r).toMatchObject({ name: "Presente da vó", customName: true });

    // the editor saves again (no name sent, e.g. an agent): the typed name stays, even if the text changes
    const b = (await callAction("save_lab_creation", { id: a.id, tool: "chaveiro", values: { text: "Aninha" } })) as Named;
    expect(b.name).toBe("Presente da vó");
    const copy = (await callAction("duplicate_lab_creation", { id: a.id })) as Named;
    expect(copy).toMatchObject({ name: "Presente da vó (cópia)", customName: true });

    // null / empty: back to the automatic name
    const c = (await callAction("save_lab_creation", { id: a.id, tool: "chaveiro", values: { text: "Aninha" }, name: null })) as Named;
    expect(c).toMatchObject({ name: "Aninha", customName: false });
    const d = (await callAction("rename_lab_creation", { id: a.id, name: "   " })) as Named;
    expect(d).toMatchObject({ name: "Aninha", customName: false });
  });

  it("names a drawing after its file, and falls back to the tool's name", () => {
    const clip = findTool("enfeite-de-clipe")!;
    expect(creationName(clip, { design: JSON.stringify({ svg: "<svg/>", name: "Coração.svg", layers: {} }) })).toBe("Coração");
    expect(creationName(findTool("chaveiro")!, { text: "  " })).toBe("Chaveiro com nome");
  });
});
