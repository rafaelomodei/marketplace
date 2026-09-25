import { scadDefines, type ParamValues } from "./params";

/**
 * Renders an OpenSCAD model with openscad-wasm, one binary STL per part.
 * Isomorphic: runs in the browser (Web Worker, see openscad.worker.ts) and in Node (actions/tests).
 */
export type RenderRequest = {
  source: string;
  values: ParamValues;
  /** Font files the model uses; each one is loaded with `use <…>`. */
  fonts: { file: string; data: Uint8Array }[];
  /** Values of the model's `part` variable to render. */
  parts: string[];
};
export type RenderResult = { parts: Record<string, Uint8Array>; ms: number };

export class ScadError extends Error {}

export async function renderParts(req: RenderRequest): Promise<RenderResult> {
  const { createOpenSCAD } = await import("openscad-wasm-prebuilt");
  const started = Date.now();
  const header = req.fonts.map((f) => `use </fonts/${f.file}>`).join("\n");
  const parts: Record<string, Uint8Array> = {};

  for (const part of req.parts) {
    // A wasm instance runs main() only once, so each part gets a fresh one.
    const log: string[] = [];
    const openscad = await createOpenSCAD({ print: (t) => log.push(t), printErr: (t) => log.push(t) });
    const fs = openscad.getInstance().FS;
    fs.mkdir("/fonts");
    for (const f of req.fonts) fs.writeFile(`/fonts/${f.file}`, f.data);
    fs.writeFile("/model.scad", `${header}\n${req.source}`);
    const args = ["/model.scad", "--enable=textmetrics", "--backend=manifold", "--export-format=binstl", ...scadDefines({ ...req.values, part }), "-o", "/out.stl"];
    const code = openscad.getInstance().callMain(args);
    let stl: Uint8Array | null = null;
    try {
      stl = fs.readFile("/out.stl") as Uint8Array;
    } catch {
      stl = null;
    }
    if (code !== 0 || !stl?.length) {
      const errors = log.filter((l) => /ERROR|WARNING: (Ignoring|Can't)/.test(l)).join("\n");
      throw new ScadError(errors || `OpenSCAD falhou (código ${code})`);
    }
    parts[part] = stl;
  }
  return { parts, ms: Date.now() - started };
}
