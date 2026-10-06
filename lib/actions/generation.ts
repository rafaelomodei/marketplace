import { z } from "zod";
import { filamentCatalog, marketplaces } from "../config";
import { exportImages } from "../export";
import { cancelJob, correctImage, createJobs, dismissJob, getJob, reframe, retryJob } from "../jobs";
import { approveImage, setCandidateStatus } from "../products";
import { defineAction } from "./define";
import { imageId, slug } from "./products";
import { CODEX_MODELS, codexSettingsSchema, getCodexSettings, setCodexSettings } from "../settings";

const aspect = z.enum(["1:1", "3:4", "ref"]).describe("1:1 quadrada, 3:4 retrato, ref = mesma proporção do cenário");
const ids = z.array(imageId).min(1);
const extra = z.string().optional().describe("Alterações permitidas além da tarefa. Tudo o que não estiver escrito fica igual.");

/** Same shape as JobRequest in lib/jobs.ts. */
export const jobRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("white-bg").describe("Packshot em fundo branco"),
    productImageIds: ids.describe("Fotos reais (kind=real) do produto"),
    aspect: aspect.default("1:1"),
    extra,
  }),
  z.object({
    type: z.literal("scene").describe("Coloca o produto num cenário de referência, trocando só o objeto-alvo"),
    sceneImageId: imageId.describe("Cenário (kind=style) a editar"),
    productImageIds: ids,
    replaceTarget: z.string().optional().describe("Objeto da cena a substituir; vazio = o mais parecido"),
    aspect: aspect.default("ref"),
    extra,
  }),
  z.object({
    type: z.literal("recolor").describe("Recria a imagem trocando cores por filamentos (uma imagem por combinação)"),
    sourceImageId: imageId,
    colors: z
      .array(z.object({ part: z.string().describe("Parte do produto, ex.: crina e cauda"), filamentIds: z.array(z.string()).min(1) }))
      .min(1),
    extra,
  }),
  z.object({ type: z.literal("reframe"), sourceImageId: imageId, aspect, extra }),
  z.object({
    type: z.literal("staged").describe("Produto em uso numa cena descrita em texto (sem foto de cenário)"),
    productImageIds: ids.describe("Fotos do produto (kind=real)"),
    setting: z.string().min(3).describe("A cena, ex.: pendurado no zíper de uma mochila"),
    aspect: aspect.default("1:1"),
    extra,
  }),
]);

export const getCatalogAction = defineAction({
  name: "get_catalog",
  title: "Catálogo",
  description: "Filamentos disponíveis para variação de cor, formatos por marketplace e modelo Codex configurado no Studio.",
  input: z.object({}),
  readOnly: true,
  run: () => ({ filaments: filamentCatalog(), marketplaces: marketplaces(), codex: { ...getCodexSettings(), models: CODEX_MODELS } }),
});

export const updateCodexSettingsAction = defineAction({
  name: "update_codex_settings",
  title: "Configurar o Codex",
  description: "Define o modelo padrão para novas gerações de imagem e texto.",
  input: codexSettingsSchema,
  run: (settings) => setCodexSettings(settings),
});

export const generateImagesAction = defineAction({
  name: "generate_images",
  title: "Gerar imagens",
  description:
    "Coloca na fila a geração de imagens com IA (1 a 3 min cada). O produto nunca muda de forma, texto ou textura. " +
    "Retorna os ids dos jobs; acompanhe com get_job. O resultado vira uma candidata para review_image.",
  input: z.object({ slug, request: jobRequest }),
  run: ({ slug, request }) => ({ jobIds: createJobs(slug, request) }),
});

export const getJobAction = defineAction({
  name: "get_job",
  title: "Ver job",
  description: "Status de um job (queued, running, done, failed, canceled), log do Codex e a imagem gerada.",
  input: z.object({ jobId: z.string().min(1) }),
  readOnly: true,
  run: ({ jobId }) => getJob(jobId),
});

export const cancelJobAction = defineAction({
  name: "cancel_job",
  title: "Cancelar job",
  description: "Cancela um job na fila ou em execução.",
  input: z.object({ jobId: z.string().min(1) }),
  run: ({ jobId }) => cancelJob(jobId),
});

export const dismissJobAction = defineAction({
  name: "dismiss_job",
  title: "Descartar job com falha",
  description: "Oculta um job que falhou ou foi cancelado, preservando o log para diagnóstico e sem apagar imagens existentes.",
  input: z.object({ jobId: z.string().min(1) }),
  run: ({ jobId }) => dismissJob(jobId),
});

export const retryJobAction = defineAction({
  name: "retry_job",
  title: "Gerar de novo",
  description: "Cria um novo job com os mesmos parâmetros (a candidata anterior continua para comparação).",
  input: z.object({ jobId: z.string().min(1) }),
  run: ({ jobId }) => ({ jobIds: retryJob(jobId) }),
});

export const reviewImageAction = defineAction({
  name: "review_image",
  title: "Aprovar ou descartar",
  description: "Aprova (copia para approved/), descarta ou desfaz a decisão sobre uma candidata gerada.",
  input: z.object({ imageId, decision: z.enum(["approve", "reject", "reset"]) }),
  run: ({ imageId, decision }) =>
    decision === "approve" ? { approvedId: approveImage(imageId) } : setCandidateStatus(imageId, decision === "reject" ? "rejected" : "pending"),
});

export const reframeImageAction = defineAction({
  name: "reframe_image",
  title: "Reenquadrar com IA",
  description: "Estende o cenário de uma imagem aprovada para outra proporção em vez de cortar. Gera uma nova candidata.",
  input: z.object({ imageId, aspect: aspect.exclude(["ref"]) }),
  run: ({ imageId, aspect }) => ({ jobIds: reframe(imageId, aspect) }),
});

export const correctImageAction = defineAction({
  name: "correct_image",
  title: "Corrigir versão de imagem",
  description: "Cria uma nova versão de uma imagem gerada com a correção solicitada e as referências originais do job.",
  input: z.object({ imageId, correction: z.string().trim().min(3).max(2000) }),
  run: ({ imageId, correction }) => ({ jobIds: correctImage(imageId, correction) }),
});

export const exportImagesAction = defineAction({
  name: "export_images",
  title: "Exportar para marketplace",
  description: "Gera os JPGs finais das imagens aprovadas nos tamanhos do marketplace (veja get_catalog).",
  input: z.object({
    imageIds: ids.describe("Imagens aprovadas (kind=approved)"),
    marketplace: z.string().min(1).describe("Id do marketplace, ex.: shopee"),
    targetIds: z.array(z.string()).min(1).describe("Formatos, ex.: 1x1, 3x4"),
    mode: z.enum(["pad", "crop"]).optional().describe("pad = completa com branco, crop = recorte inteligente; vazio = automático"),
  }),
  run: async (input) => ({ created: await exportImages(input) }),
});
