/// <reference lib="webworker" />
import { renderParts, type RenderRequest } from "./engine";

/** Runs OpenSCAD off the main thread so the page stays responsive while a model renders. */
type Message = { id: number } & Omit<RenderRequest, "fonts"> & { fontFiles: string[] };

const fontCache = new Map<string, Promise<Uint8Array>>();
const loadFont = (file: string) => {
  if (!fontCache.has(file))
    fontCache.set(
      file,
      fetch(`/lab/fonts/${file}`).then(async (r) => {
        if (!r.ok) throw new Error(`Fonte não encontrada: ${file}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
  return fontCache.get(file)!;
};

self.onmessage = async (e: MessageEvent<Message>) => {
  const { id, fontFiles, ...req } = e.data;
  try {
    const fonts = await Promise.all(fontFiles.map(async (file) => ({ file, data: await loadFont(file) })));
    const result = await renderParts({ ...req, fonts });
    (self as unknown as Worker).postMessage({ id, ok: true, result }, Object.values(result.parts).map((p) => p.buffer as ArrayBuffer));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: (err as Error).message });
  }
};
