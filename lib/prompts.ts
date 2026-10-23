import type { Filament } from "./config";
import type { ProductMeta } from "./products";

export type Aspect = "1:1" | "3:4" | "ref";
export type SocialPlatform = "instagram" | "tiktok" | "facebook";
export type SocialFormat = "feed-portrait" | "feed-square" | "vertical";
export type ColorMapping = { part: string; filamentId: string };

export type JobParams =
  | { type: "white-bg"; productImageIds: number[]; aspect: Aspect; extra?: string }
  | {
      type: "scene";
      sceneImageId: number;
      productImageIds: number[];
      /** What to swap for the product in the scene; empty = the most similar object. */
      replaceTarget?: string;
      aspect: Aspect;
      extra?: string;
    }
  | {
      type: "recolor";
      sourceImageId: number;
      colors: ColorMapping[];
      /** Filament photos attached after the base image, filled in when the job is created. */
      refs?: { filamentId: string; files: string[] }[];
      extra?: string;
    }
  | { type: "reframe"; sourceImageId: number; aspect: Aspect; extra?: string }
  | { type: "correct"; sourceImageId: number; referenceImageIds: number[]; correction: string; aspect: Aspect; extra?: string }
  | {
      /** The product in use, in a scene described in words (no scene photo needed). */
      type: "staged";
      productImageIds: number[];
      setting: string;
      aspect: Aspect;
      extra?: string;
    }
  | {
      type: "social";
      productImageIds: number[];
      platform: SocialPlatform;
      format: SocialFormat;
      objective: string;
      headline?: string;
      supportingText?: string;
      cta?: string;
      extra?: string;
    };

export type JobType = JobParams["type"];

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  "white-bg": "Fundo branco",
  scene: "Cenário",
  recolor: "Variação de cor",
  reframe: "Reenquadrar",
  correct: "Correção",
  staged: "Em uso",
  social: "Redes sociais",
};

/** Upgrades params stored by older versions (scene used to take a list of style refs). */
export function normalizeParams(raw: unknown): JobParams {
  const p = raw as JobParams & { styleImageIds?: number[] };
  if (p.type === "scene" && p.sceneImageId === undefined && p.styleImageIds?.length) {
    const { styleImageIds, ...rest } = p;
    return { ...rest, sceneImageId: styleImageIds[0] };
  }
  return p;
}

/** Image ids in the exact order they are attached to Codex (the prompt refers to them by position). */
export function jobInputIds(p: JobParams): number[] {
  switch (p.type) {
    case "white-bg":
      return p.productImageIds;
    case "scene":
      // The scene is the edit target, so it goes first.
      return [p.sceneImageId, ...p.productImageIds];
    case "recolor":
    case "reframe":
      return [p.sourceImageId];
    case "correct":
      return [p.sourceImageId, ...p.referenceImageIds.filter((id) => id !== p.sourceImageId)];
    case "staged":
    case "social":
      return p.productImageIds;
  }
}

const ASPECT_TEXT: Record<Aspect, string> = {
  "1:1": "`1:1` (tela quadrada)",
  "3:4": "`3:4` (tela retrato, com margem livre em cima e embaixo)",
  ref: "`ref` (mesma proporção da imagem base ou de cenário)",
};

function imageRange(from: number, count: number): string {
  return count === 1 ? `Imagem ${from}` : `Imagens ${from}–${from + count - 1}`;
}

export const filamentHex = (f: Pick<Filament, "hex" | "hexOverride">) => f.hexOverride ?? f.hex ?? "#CCCCCC";

function describeFilament(f: Filament | undefined, id: string): string {
  if (!f) return `filamento "${id}"`;
  return `${f.name} (${f.line}, cor ${filamentHex(f)}; acabamento: ${f.finish})`;
}

export type PromptContext = {
  meta: ProductMeta;
  filament: (id: string) => Filament | undefined;
  /** Body of skills/marketplace-product-image/SKILL.md — the rules every job follows. */
  skill: string;
  /** Number of canonical Verde Forma visual references attached after product images. */
  socialReferenceCount?: number;
  /** Official logo variants attached after the visual references, in this exact order. */
  socialBrandAssets?: { label: string; use: string }[];
  /** First social input is an approved/generated composition that must be edited in place. */
  socialBaseTarget?: boolean;
};

/** The skill holds the rules; this builds the short job sheet that goes after it. */
export function buildPrompt(p: JobParams, ctx: PromptContext): { prompt: string; label: string } {
  const { meta } = ctx;
  const images: string[] = [];
  const task: string[] = [];
  let label: string;
  let aspect: Aspect | null = null;

  switch (p.type) {
    case "white-bg":
      label = "fundo-branco";
      aspect = p.aspect;
      images.push(`${imageRange(1, p.productImageIds.length)}: PRODUTO — fotos reais do mesmo objeto.`);
      task.push("Criar o packshot do produto em fundo branco puro (seção 4, Fundo branco).");
      break;
    case "scene": {
      label = "cenario";
      aspect = p.aspect;
      images.push("Imagem 1: CENÁRIO — alvo da edição. Manter tudo, exceto o objeto-alvo.");
      images.push(`${imageRange(2, p.productImageIds.length)}: PRODUTO — fotos reais do mesmo objeto.`);
      task.push("Editar a Imagem 1 substituindo só o objeto-alvo pelo nosso produto (seção 4, Cenário, e seção 3).");
      task.push(
        `OBJETO A SUBSTITUIR: ${p.replaceTarget?.trim() || "o objeto da cena mais parecido com o nosso produto (mesma função/categoria)"}.`,
      );
      break;
    }
    case "recolor": {
      label = `cor-${p.colors.map((c) => c.filamentId).join("-")}`;
      images.push("Imagem 1: BASE — recriar idêntica, trocando só as cores listadas.");
      let next = 2;
      for (const ref of p.refs ?? []) {
        if (!ref.files.length) continue;
        const f = ctx.filament(ref.filamentId);
        images.push(
          `${imageRange(next, ref.files.length)}: REFERÊNCIA DE COR — filamento ${f ? `${f.name} (${f.line})` : ref.filamentId}. ` +
            "Use só a cor e o acabamento; ignore o objeto e o carretel.",
        );
        next += ref.files.length;
      }
      task.push("Trocar as cores destas partes do produto pelos filamentos indicados (seção 4, Variação de cor):");
      for (const c of p.colors)
        task.push(`  • ${c.part.trim() || "o produto inteiro"} → ${describeFilament(ctx.filament(c.filamentId), c.filamentId)}`);
      task.push("As cores citadas nas notas do vendedor podem mudar neste job; o resto das notas (formas, textos, detalhes) continua valendo.");
      task.push("Formato: o mesmo da Imagem 1.");
      break;
    }
    case "reframe":
      label = `reenquadrar-${p.aspect.replace(":", "x")}`;
      aspect = p.aspect;
      images.push("Imagem 1: BASE — manter idêntica, só estender o quadro.");
      task.push("Mudar o formato estendendo o cenário para as bordas novas (seção 4, Reenquadrar).");
      break;
    case "correct":
      label = "correcao";
      aspect = p.aspect;
      images.push("Imagem 1: VERSÃO A CORRIGIR — manter a composição, o cenário e tudo que já está correto.");
      if (p.referenceImageIds.length)
        images.push(`${imageRange(2, p.referenceImageIds.length)}: REFERÊNCIAS ORIGINAIS — produto e, quando houver, cenário usados na criação anterior.`);
      task.push("Criar uma nova versão da Imagem 1, aplicando somente a correção solicitada abaixo.");
      task.push(`CORREÇÃO SOLICITADA: ${p.correction.trim()}`);
      task.push("As referências originais têm prioridade para fidelidade do produto; não introduza alterações além da correção.");
      break;
    case "staged":
      label = "em-uso";
      aspect = p.aspect;
      images.push(`${imageRange(1, p.productImageIds.length)}: PRODUTO — fotos do mesmo objeto.`);
      task.push("Criar uma foto realista do produto em uso, na cena descrita abaixo (seção 4, Em uso).");
      task.push(`CENA: ${p.setting.trim()}`);
      break;
    case "social": { 
      label = `social-${p.platform}-${p.format}`;
      if (ctx.socialBaseTarget) {
        images.push("Imagem 1: BASE DE EDIÇÃO E PRODUTO IMUTÁVEL — partir desta imagem; preservar integralmente o produto e tudo que já estiver correto.");
        if (p.productImageIds.length > 1)
          images.push(`${imageRange(2, p.productImageIds.length - 1)}: REFERÊNCIAS ORIGINAIS DO MESMO PRODUTO — usar para conferir geometria, cores, peças e acabamento; não copiar fundo.`);
      } else {
        images.push(`${imageRange(1, p.productImageIds.length)}: PRODUTO — referências reais prioritárias; preservar forma, cores, inscrições e acabamento.`);
      }
      if (ctx.socialReferenceCount)
        images.push(
          `${imageRange(p.productImageIds.length + 1, ctx.socialReferenceCount)}: REFERÊNCIA VISUAL OBRIGATÓRIA DA MARCA — copiar o sistema visual (paleta, tipografia, proporções, respiro, hierarquia e linguagem fotográfica); ignorar os produtos, textos e logos presentes nessa referência.`,
        );
      let nextSocialImage = p.productImageIds.length + (ctx.socialReferenceCount ?? 0) + 1;
      for (const asset of ctx.socialBrandAssets ?? []) {
        images.push(`Imagem ${nextSocialImage}: ${asset.label} — ${asset.use}. Importar sem redesenhar, recolorir, recortar ou deformar.`);
        nextSocialImage += 1;
      }
      const platform = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" }[p.platform];
      const format = {
        "feed-portrait": "feed retrato 4:5 (1080 × 1350 px)",
        "feed-square": "feed quadrado 1:1 (1080 × 1080 px)",
        vertical: "vertical 9:16 para Stories/Reels/TikTok (1080 × 1920 px)",
      }[p.format];
      task.push(`Criar uma peça estática para ${platform}, no formato ${format}, seguindo integralmente o guia específico de redes sociais acima.`);
      task.push("A referência visual da marca anexada é um ALVO DE DIREÇÃO DE ARTE, não apenas inspiração. A saída deve parecer uma nova publicação do mesmo perfil.");
      task.push("Antes de gerar, elaborar internamente um plano estruturado com: variante A–E, caixas normalizadas de produto/título/apoio/CTA/logo, margem segura, paleta da interface e ornamentos. Só então gerar a cena e aplicar a composição gráfica.");
      task.push("Executar na ordem: (1) planejar caixas sem colisão; (2) produzir a cena preservando o produto e deixando as áreas reservadas vazias; (3) aplicar texto e CTA como camada gráfica; (4) pontuar o QA. Rejeitar a própria saída se houver bloqueio ou nota menor que 14/16.");
      if (ctx.socialBaseTarget)
        task.push("EDITAR A IMAGEM 1, não recriá-la. Tratar a região do produto como máscara bloqueada: não redesenhar, rel iluminar, completar, estilizar ou substituir nenhum pixel essencial do objeto. As imagens seguintes servem para auditoria de fidelidade.");
      task.push("PROIBIÇÃO ABSOLUTA: não adicionar pavio, chama, faísca, suporte, encaixe, ornamento, peça, cor ou função ao produto por inferência semântica. Uma 'vela' não deve ser acesa nem ganhar pavio se isso não estiver visível nas referências ou explicitamente solicitado.");
      task.push(`OBJETIVO DA PEÇA: ${p.objective.trim()}`);
      task.push(`HEADLINE: ${p.headline?.trim() || "não inserir"}.`);
      task.push(`TEXTO DE APOIO: ${p.supportingText?.trim() || "não inserir"}.`);
      task.push(`CHAMADA PARA AÇÃO: ${p.cta?.trim() || "não inserir"}.`);
      task.push("ASSINATURA OBRIGATÓRIA: inserir exatamente uma das variantes oficiais anexadas, escolhida pelo contraste do fundo e nas dimensões/posição definidas pelo guia. A geometria, as proporções, as cores e a área de proteção do asset são imutáveis.");
      task.push("Não criar logo, arroba, preço, condição comercial ou texto por conta própria. A logo deve ser importada somente dos assets oficiais anexados; os demais itens só entram quando fornecidos neste job.");
      break;
    }
  }

  const sheet = [
    "# JOB",
    `Modo: ${JOB_TYPE_LABEL[p.type]} (\`${p.type}\`)`,
    `Produto: "${meta.name}"${meta.description ? ` — ${meta.description}` : ""}`,
    meta.fidelityNotes ? `Notas do vendedor (NUNCA mudar): ${meta.fidelityNotes}` : "",
    "",
    "## Imagens anexadas",
    ...images.map((l) => `- ${l}`),
    "",
    "## Tarefa",
    ...task.map((l) => (l.startsWith("  ") ? l : `- ${l}`)),
    aspect ? `- Formato: ${ASPECT_TEXT[aspect]}.` : "",
    "",
    "## Alterações permitidas",
    p.extra?.trim()
      ? `Além da tarefa acima, só pode mudar exatamente isto (e nada mais):\n${p.extra.trim()}`
      : "Nenhuma além da tarefa acima. Todo o resto fica idêntico às imagens de entrada.",
  ]
    .filter((l) => l !== "")
    .join("\n")
    .replace(/\n(## )/g, "\n\n$1");

  return { prompt: `${ctx.skill.trim()}\n\n---\n\n${sheet}\n`, label };
}
