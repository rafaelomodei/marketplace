import { z } from "zod";
import { LAB_FONTS } from "../lab/fonts";
import { renderTool } from "../lab/server";
import { LAB_TOOLS } from "../lab/tools";
import { defineAction } from "./define";

export const listLabToolsAction = defineAction({
  name: "list_lab_tools",
  title: "Ferramentas do Lab",
  description:
    "Lista as ferramentas do Lab (peças personalizáveis para imprimir em 3D), com os parâmetros de cada uma, as peças/cores e as fontes disponíveis.",
  input: z.object({}),
  readOnly: true,
  run: () => ({
    tools: LAB_TOOLS.map(({ source: _source, validate: _v, fileName: _f, ...t }) => t),
    fonts: LAB_FONTS.map((f) => ({ family: f.family, style: f.style })),
  }),
});

export const renderLabModelAction = defineAction({
  name: "render_lab_model",
  title: "Gerar peça do Lab",
  description:
    "Gera o modelo 3D de uma ferramenta do Lab (ex.: chaveiro com nome) com os valores dados. Parâmetros omitidos usam o padrão. " +
    "Retorna as medidas em mm, os STLs em base64 e, no modo multicolor, o 3MF (uma peça por cor). " +
    "No modo de uma cor (print_mode=single) a base vem com encaixes para as peças separadas.",
  input: z.object({
    tool: z.string().min(1).describe("Id da ferramenta, ex.: chaveiro"),
    values: z.record(z.string(), z.union([z.string(), z.number()])).default({}).describe("Valores dos parâmetros (veja list_lab_tools)"),
  }),
  run: async ({ tool, values }) => {
    const r = await renderTool(tool, values);
    return {
      values: r.values,
      sizeMm: r.size,
      renderMs: r.ms,
      fileName: `${r.tool.fileName?.(r.values) ?? r.tool.id}.3mf`,
      file3mfBase64: r.file3mf ? Buffer.from(r.file3mf).toString("base64") : null,
      stlFiles: r.files.map((f) => ({ name: f.name, label: f.label, base64: Buffer.from(f.data).toString("base64") })),
    };
  },
});
