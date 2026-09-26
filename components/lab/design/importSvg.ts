import { artOf, writeDesign } from "@/lib/lab/svg";

const MAX_FILE = 3 * 1024 * 1024;

/** Reads a dropped/picked file into a new design (saved JSON), or explains in plain words why it can't be used. */
export async function importSvg(file: File): Promise<{ design: string } | { error: string }> {
  if (file.size > MAX_FILE) return { error: "O arquivo é grande demais (máximo 3 MB). Simplifique o desenho antes de exportar." };
  if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml")
    return { error: "Por enquanto o editor aceita só SVG. Exporte o desenho como SVG no seu programa (Canva, Illustrator, Inkscape…)." };
  const svg = await file.text();
  try {
    if (!artOf(svg).shapes.length) return { error: "Esse SVG não tem formas preenchidas — só linhas ou textos. Converta tudo em formas antes de exportar." };
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { design: writeDesign({ svg, name: file.name.replace(/\.svg$/i, ""), layers: {} }) };
}
