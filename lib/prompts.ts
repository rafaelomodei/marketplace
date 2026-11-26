import type { Filament } from "./config";
import type { ProductMeta } from "./products";
import { boxInFrame, GENERATION_FRAME, SOCIAL_CANVAS, socialZones, type SocialDesign } from "./social-layout";

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
  | {
      type: "correct";
      sourceImageId: number;
      referenceImageIds: number[];
      correction: string;
      aspect: Aspect;
      extra?: string;
      /** Inherited from a social piece: Imagem 1 is its clean photo and the same texts are laid on top again. */
      design?: SocialDesign;
    }
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
  /** Real size of the object, from the print library (keeps the scale right in scenes). */
  sizeNote?: string;
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
      if (p.design) {
        task.push("A Imagem 1 é a FOTOGRAFIA de uma peça de rede social, sem textos: título, apoio, chamada e logo são aplicados pelo sistema depois. Pedidos sobre textos ou logo não se aplicam à foto.");
        task.push(...socialFrameBrief(p.design.format));
      }
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
      images.push(`${imageRange(1, p.productImageIds.length)}: PRODUTO — o mesmo objeto; é ESTE objeto que aparece na foto, recriado com fidelidade total.`);
      const platform = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" }[p.platform];
      task.push(`Fotografar o produto para uma publicação de ${platform}, seguindo o guia de fotografia acima.`);
      task.push(`OBJETIVO DA PUBLICAÇÃO: ${p.objective.trim()}`);
      const words = [p.headline, p.supportingText].filter((t) => t?.trim()).join(" / ");
      if (words) task.push(`Mensagem que o sistema vai escrever sobre a foto (NÃO escreva na imagem; use só para escolher o clima da cena): "${words}".`);
      task.push(...socialFrameBrief(p.format));
      break;
    }
  }

  const sheet = [
    "# JOB",
    `Modo: ${JOB_TYPE_LABEL[p.type]} (\`${p.type}\`)`,
    `Produto: "${meta.name}"${meta.description ? ` — ${meta.description}` : ""}`,
    meta.fidelityNotes ? `Notas do vendedor (NUNCA mudar): ${meta.fidelityNotes}` : "",
    ctx.sizeNote ?? "",
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

const area = (b: { x0: number; y0: number; x1: number; y1: number }) => `x ${b.x0}–${b.x1}%, y ${b.y0}–${b.y1}%`;

/** Size and free areas of a social photo, in percent of the generated image (see lib/social-design.ts). */
export function socialFrameBrief(format: SocialFormat): string[] {
  const frame = GENERATION_FRAME[format];
  const zones = socialZones(format);
  const visible = boxInFrame(format, { left: 0, top: 0, ...SOCIAL_CANVAS[format] });
  const product = boxInFrame(format, zones.product);
  const crop =
    format === "feed-square"
      ? ""
      : format === "vertical"
        ? ` As faixas x 0–${visible.x0}% e ${visible.x1}–100% são cortadas depois: nada importante nelas.`
        : ` As faixas y 0–${visible.y0}% e ${visible.y1}–100% são cortadas depois: nada do produto nelas.`;
  return [
    `FORMATO: gerar em ${frame.width} × ${frame.height} px.${crop}`,
    `ÁREA DO TÍTULO livre e clara: ${area(boxInFrame(format, zones.text))}.`,
    `ÁREA DO RODAPÉ livre e clara: ${area(boxInFrame(format, zones.footer))}.`,
    `PRODUTO inteiro, dentro de ${area(product)}: altura de cerca de ${Math.round((product.y1 - product.y0) * 0.85)}% da imagem, com fundo livre visível acima do ponto mais alto dele (pontas incluídas, abaixo de y ${product.y0}%) e a base apoiada na superfície por volta de y ${product.y1 - 3}%.`,
    "NENHUM texto, letra, logo, botão ou moldura na imagem.",
  ];
}
