import { z } from "zod";
import {
  createProduct,
  deleteImage,
  getProduct,
  listProducts,
  moveProduct,
  saveUpload,
  writeMeta,
} from "../products";
import { nextStep, stateFromProduct, stateFromSummary } from "../workflow";
import { defineAction } from "./define";

export const slug = z.string().min(1).describe("Identificador do produto (nome da pasta), ex.: cavalo-carrossel");
export const imageId = z.number().int().positive().describe("Id de uma imagem do produto (veja get_product)");

export const listProductsAction = defineAction({
  name: "list_products",
  title: "Listar produtos",
  description: "Lista todos os produtos com contagem de fotos, candidatas e aprovadas, e o próximo passo sugerido de cada um.",
  input: z.object({}),
  readOnly: true,
  run: () => listProducts().map((p) => ({ ...p, next: nextStep(stateFromSummary(p)) })),
});

export const getProductAction = defineAction({
  name: "get_product",
  title: "Ver produto",
  description: "Dados completos de um produto: descrição, imagens (fotos reais, cenários, candidatas, aprovadas, exportações) e jobs recentes.",
  input: z.object({ slug }),
  readOnly: true,
  run: ({ slug }) => getProduct(slug),
});

export const getNextStepAction = defineAction({
  name: "get_next_step",
  title: "Próximo passo",
  description: "Diz o que falta fazer no produto (enviar fotos, criar, escolher ou exportar imagens). Use para guiar o usuário.",
  input: z.object({ slug }),
  readOnly: true,
  run: ({ slug }) => nextStep(stateFromProduct(getProduct(slug))),
});

export const createProductAction = defineAction({
  name: "create_product",
  title: "Criar produto",
  description: "Cria a pasta de um novo produto. Depois envie as fotos reais com add_images.",
  input: z.object({
    name: z.string().trim().min(1).describe("Nome do produto, ex.: Topo de bolo Amália"),
    description: z.string().optional(),
    fidelityNotes: z.string().optional().describe("O que NUNCA pode mudar no produto (textos, números, detalhes)"),
  }),
  run: ({ name, ...meta }) => ({ slug: createProduct(name, meta) }),
});

export const updateProductAction = defineAction({
  name: "update_product",
  title: "Editar produto",
  description: "Atualiza nome, descrição, o que nunca pode mudar e os marketplaces do produto. Vale para os próximos jobs.",
  input: z.object({
    slug,
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    fidelityNotes: z.string().optional(),
    marketplaces: z.array(z.string()).optional(),
  }),
  run: ({ slug, ...patch }) => writeMeta(slug, patch),
});

export const moveProductAction = defineAction({
  name: "move_product",
  title: "Mudar etapa do produto",
  description: "Marca o produto como pronto (ready) ou volta para criação (create). Move a pasta.",
  input: z.object({ slug, stage: z.enum(["create", "ready"]) }),
  run: ({ slug, stage }) => moveProduct(slug, stage),
});

export const addImagesAction = defineAction({
  name: "add_images",
  title: "Enviar imagens",
  description:
    "Adiciona fotos reais do produto (kind=real) ou cenários de referência (kind=style). Os arquivos vão em base64 (png, jpg ou webp).",
  input: z.object({
    slug,
    kind: z.enum(["real", "style"]),
    files: z
      .array(
        z.object({
          name: z.string().min(1).describe("Nome do arquivo com extensão"),
          data: z.union([z.string().describe("Conteúdo em base64"), z.instanceof(Uint8Array)]),
        }),
      )
      .min(1),
  }),
  run: ({ slug, kind, files }) => ({
    saved: files.map((f) =>
      saveUpload(slug, kind, f.name, typeof f.data === "string" ? Buffer.from(f.data, "base64") : Buffer.from(f.data)),
    ),
  }),
});

export const deleteImageAction = defineAction({
  name: "delete_image",
  title: "Excluir imagem",
  description: "Apaga o arquivo da imagem da pasta do produto.",
  input: z.object({ imageId }),
  run: ({ imageId }) => deleteImage(imageId),
});
