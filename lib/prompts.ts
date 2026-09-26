import type { Filament } from "./config";
import type { LabSource, ProductMeta } from "./products";

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
  | { type: "reframe"; sourceImageId: number; aspect: Aspect; extra?: string }
  | {
      /** A real-looking photo of the printed piece from a picture of its 3D model (products made in the Lab). */
      type: "from-3d";
      /** The 3D picture to turn into a photo (its angle and framing are kept). */
      renderImageId: number;
      /** The other 3D pictures (same model, other angles), to understand the shape. */
      otherRenderIds: number[];
      /** Filament photos of the parts, filled in when the job is created. */
      refs?: { filamentId: string; files: string[] }[];
      extra?: string;
    }
  | {
      /** The product in use, in a scene described in words (no scene photo needed). */
      type: "staged";
      productImageIds: number[];
      setting: string;
      aspect: Aspect;
      extra?: string;
    };

export type JobType = JobParams["type"];

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  "white-bg": "Fundo branco",
  scene: "Cenário",
  recolor: "Variação de cor",
  reframe: "Reenquadrar",
  "from-3d": "Foto real do 3D",
  staged: "Em uso",
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
    case "from-3d":
      return [p.renderImageId, ...p.otherRenderIds.filter((id) => id !== p.renderImageId)];
    case "staged":
      return p.productImageIds;
  }
}

const mmText = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** What the Lab knows about a product made there: real size and the filament of each part. */
function labFacts(lab: LabSource, filament: PromptContext["filament"]): string[] {
  const lines: string[] = [];
  if (lab.sizeMm) lines.push(`Tamanho real da peça: ${lab.sizeMm.map(mmText).join(" × ")} mm (largura × altura × espessura) — use essa escala.`);
  lines.push("Cores reais de cada parte (filamento usado na impressão):");
  for (const part of lab.parts)
    lines.push(`  • ${part.label} → ${part.filamentId ? describeFilament(filament(part.filamentId), part.filamentId) : `cor ${part.hex}`}`);
  if (lab.notes) lines.push(lab.notes);
  return lines;
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
    case "from-3d": {
      label = "foto-do-3d";
      const others = p.otherRenderIds.filter((id) => id !== p.renderImageId).length;
      images.push("Imagem 1: MODELO 3D — imagem de computador da peça, NÃO é foto. Alvo: mesma peça, mesmo ângulo e enquadramento.");
      if (others) images.push(`${imageRange(2, others)}: MODELO 3D — o mesmo modelo de outros ângulos, só para entender a forma.`);
      let next = 2 + others;
      for (const ref of p.refs ?? []) {
        if (!ref.files.length) continue;
        const f = ctx.filament(ref.filamentId);
        images.push(
          `${imageRange(next, ref.files.length)}: REFERÊNCIA DE COR — filamento ${f ? `${f.name} (${f.line})` : ref.filamentId}. ` +
            "Use só a cor e o acabamento; ignore o objeto e o carretel.",
        );
        next += ref.files.length;
      }
      task.push("Transformar a Imagem 1 numa FOTO REAL da peça já impressa em 3D, em fundo branco (seção 4, Foto real do 3D).");
      if (meta.lab) task.push(...labFacts(meta.lab, ctx.filament));
      aspect = "1:1";
      break;
    }
    case "staged":
      label = "em-uso";
      aspect = p.aspect;
      images.push(`${imageRange(1, p.productImageIds.length)}: PRODUTO — fotos do mesmo objeto.`);
      task.push("Criar uma foto realista do produto em uso, na cena descrita abaixo (seção 4, Em uso).");
      task.push(`CENA: ${p.setting.trim()}`);
      if (meta.lab?.sizeMm) task.push(`Tamanho real da peça: ${meta.lab.sizeMm.map(mmText).join(" × ")} mm — respeite essa escala perto de objetos do dia a dia.`);
      if (meta.lab?.notes) task.push(meta.lab.notes);
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
