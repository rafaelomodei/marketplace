import { z } from "zod";
import { deleteCreation, duplicateCreation, getCreation, listCreations, renameCreation, saveCreation } from "../lab/creations";
import { sendCreationToStudio } from "../lab/mockup";
import { MAX_CREATION_NAME } from "../lab/naming";
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
    "No modo de uma cor (print_mode=single) a base vem com encaixes para as peças separadas. " +
    "Ferramentas com desenho (ex.: enfeite-de-clipe) recebem em `design` o SVG em texto ou o desenho salvo pelo editor.",
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

const values = z.record(z.string(), z.union([z.string(), z.number()]));
const creationNameInput = z
  .string()
  .max(MAX_CREATION_NAME)
  .nullable()
  .describe("Nome escolhido para a criação; vazio ou null = nome automático");

export const listLabCreationsAction = defineAction({
  name: "list_lab_creations",
  title: "Criações do Lab",
  description:
    "Lista as peças já criadas no Lab (histórico), da mais recente para a mais antiga, com nome e datas. " +
    "Filtre por ferramenta com `tool`. Para abrir uma, use get_lab_creation.",
  input: z.object({ tool: z.string().optional().describe("Id da ferramenta, ex.: chaveiro. Omita para ver todas.") }),
  readOnly: true,
  run: ({ tool }) => ({ creations: listCreations(tool) }),
});

export const getLabCreationAction = defineAction({
  name: "get_lab_creation",
  title: "Abrir criação do Lab",
  description: "Retorna uma criação salva do Lab: a ferramenta, os valores dos parâmetros e as cores de cada peça. Os valores servem direto em render_lab_model.",
  input: z.object({ id: z.string().min(1) }),
  readOnly: true,
  run: ({ id }) => getCreation(id),
});

export const saveLabCreationAction = defineAction({
  name: "save_lab_creation",
  title: "Salvar criação do Lab",
  description:
    "Salva uma peça do Lab no histórico para abrir depois. Sem `id` cria uma nova; com `id` atualiza a existente. " +
    "Sem `name`, o nome é tirado do texto digitado (ex.: o nome do chaveiro) — ou mantém o que alguém escolheu.",
  input: z.object({
    id: z.string().optional().describe("Id de uma criação existente, para atualizar"),
    tool: z.string().min(1).describe("Id da ferramenta, ex.: chaveiro"),
    values: values.describe("Valores dos parâmetros (veja list_lab_tools)"),
    colors: z
      .record(z.string(), z.object({ filamentId: z.string().nullable(), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
      .optional()
      .describe("Cor de cada peça: filamento do catálogo (ou null) e a cor em hex"),
    thumbnail: z.string().nullable().optional().describe("Miniatura (data URL de imagem). Opcional."),
    name: creationNameInput.optional(),
  }),
  run: (input) => saveCreation(input),
});

export const renameLabCreationAction = defineAction({
  name: "rename_lab_creation",
  title: "Renomear criação do Lab",
  description: "Muda o nome de uma criação do Lab no histórico. Nome vazio (ou null) volta ao automático, tirado do texto da peça.",
  input: z.object({ id: z.string().min(1), name: creationNameInput }),
  run: ({ id, name }) => renameCreation(id, name),
});

export const duplicateLabCreationAction = defineAction({
  name: "duplicate_lab_creation",
  title: "Duplicar criação do Lab",
  description: "Faz uma cópia de uma criação do Lab, para testar variações sem perder a original.",
  input: z.object({ id: z.string().min(1) }),
  run: ({ id }) => duplicateCreation(id),
});

export const deleteLabCreationAction = defineAction({
  name: "delete_lab_creation",
  title: "Excluir criação do Lab",
  description: "Exclui uma criação do histórico do Lab. Não dá para desfazer.",
  input: z.object({ id: z.string().min(1) }),
  run: ({ id }) => deleteCreation(id),
});

export const sendLabCreationToStudioAction = defineAction({
  name: "send_lab_creation_to_studio",
  title: "Gerar mockup para o marketplace",
  description:
    "Leva uma criação do Lab para o Studio: renderiza o modelo 3D no servidor, tira imagens de 4 ângulos e cria um produto com elas " +
    "(kind=render), com a cor real de cada parte e o tamanho em mm. Se a criação já tem produto, atualiza as imagens do 3D dele. " +
    "Depois, gere as fotos reais com generate_images (type from-3d) e siga o fluxo do produto (get_next_step).",
  input: z.object({ id: z.string().min(1).describe("Id da criação (veja list_lab_creations)") }),
  run: ({ id }) => sendCreationToStudio(id),
});
