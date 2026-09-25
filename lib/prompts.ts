import type { Filament } from "./config";
import type { ProductMeta } from "./products";

export type Aspect = "1:1" | "3:4" | "ref";
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
  | { type: "reframe"; sourceImageId: number; aspect: Aspect; extra?: string };

export type JobType = JobParams["type"];

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  "white-bg": "Fundo branco",
  scene: "Cenário",
  recolor: "Variação de cor",
  reframe: "Reenquadrar",
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
  }
}

const ASPECT_TEXT: Record<Aspect, string> = {
  "1:1": "`1:1` (tela quadrada)",
  "3:4": "`3:4` (tela retrato, com margem livre em cima e embaixo)",
  ref: "`ref` (mesma proporção da imagem de cenário)",
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
