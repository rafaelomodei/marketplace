import type { ProductDetail, ProductSummary } from "./products";

/**
 * The guided flow shown to the seller (and returned to agents via the `get_next_step` action).
 * Pure functions only: this file is imported by the browser too.
 */
export const STEPS = [
  { id: "photos", label: "Fotos", title: "Fotos do produto", description: "Envie fotos reais do produto já impresso." },
  { id: "create", label: "Criar", title: "Criar imagens", description: "A IA cria as imagens do anúncio a partir das suas fotos." },
  { id: "review", label: "Escolher", title: "Escolher as melhores", description: "Aprove as imagens que ficaram fiéis ao produto." },
  { id: "publish", label: "Publicar", title: "Preparar para o marketplace", description: "Gera os arquivos no tamanho que cada marketplace pede." },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

/** Counts that drive the flow; built from a product summary or a full product. */
export type WorkflowState = {
  stage: "create" | "ready";
  real: number;
  style: number;
  generated: number;
  pendingReview: number;
  approved: number;
  exported: number;
  activeJobs: number;
};

export type NextStep = {
  step: StepId;
  title: string;
  description: string;
  /** Label of the main button; null when the seller only has to wait. */
  cta: string | null;
  tone: "action" | "waiting" | "done";
};

export function stateFromSummary(p: ProductSummary): WorkflowState {
  return {
    stage: p.stage,
    real: p.counts.real,
    style: p.counts.style,
    generated: p.counts.generated,
    pendingReview: p.counts.pendingReview,
    approved: p.counts.approved,
    exported: p.counts.export,
    activeJobs: p.activeJobs,
  };
}

export function stateFromProduct(p: Pick<ProductDetail, "stage" | "images" | "jobs">): WorkflowState {
  const count = (kind: string) => p.images.filter((i) => i.kind === kind).length;
  return {
    stage: p.stage,
    real: count("real"),
    style: count("style"),
    generated: count("generated"),
    pendingReview: p.images.filter((i) => i.kind === "generated" && i.status === "pending").length,
    approved: count("approved"),
    exported: count("export"),
    activeJobs: p.jobs.filter((j) => j.status === "queued" || j.status === "running").length,
  };
}

/** Which steps are complete, for the stepper. */
export function completedSteps(s: WorkflowState): Record<StepId, boolean> {
  return { photos: s.real > 0, create: s.generated > 0, review: s.approved > 0, publish: s.exported > 0 };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The single most useful thing to do now. */
export function nextStep(s: WorkflowState): NextStep {
  if (s.stage === "ready")
    return { step: "publish", title: "Produto pronto", description: "Os arquivos estão prontos para o anúncio.", cta: null, tone: "done" };
  if (!s.real)
    return {
      step: "photos",
      title: "Comece pelas fotos",
      description: "Envie 2 ou 3 fotos do produto impresso, de ângulos diferentes. Pode ser foto de celular.",
      cta: "Enviar fotos",
      tone: "action",
    };
  if (s.activeJobs)
    return {
      step: "review",
      title: `Criando ${plural(s.activeJobs, "imagem", "imagens")}…`,
      description: "Cada imagem leva de 1 a 3 minutos. Você pode sair desta página; elas aparecem aqui quando ficarem prontas.",
      cta: "Acompanhar",
      tone: "waiting",
    };
  if (s.pendingReview)
    return {
      step: "review",
      title: `${plural(s.pendingReview, "imagem pronta", "imagens prontas")} para você escolher`,
      description: "Aprove as que ficaram fiéis ao produto e descarte o resto.",
      cta: "Escolher imagens",
      tone: "action",
    };
  if (!s.approved)
    return {
      step: "create",
      title: s.generated ? "Crie outras imagens" : "Crie a primeira imagem",
      description: "Comece pelo fundo branco: é a foto principal exigida pela Shopee e pelo Mercado Livre.",
      cta: "Criar imagem",
      tone: "action",
    };
  if (!s.exported)
    return {
      step: "publish",
      title: `${plural(s.approved, "imagem aprovada", "imagens aprovadas")}`,
      description: "Agora é só gerar os arquivos no tamanho certo do marketplace.",
      cta: "Preparar arquivos",
      tone: "action",
    };
  return {
    step: "publish",
    title: "Arquivos prontos",
    description: "Suba os arquivos no anúncio ou marque o produto como pronto.",
    cta: "Ver arquivos",
    tone: "done",
  };
}
