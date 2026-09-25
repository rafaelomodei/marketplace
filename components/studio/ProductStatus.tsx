import { Badge, type BadgeTone } from "@/components/ui";
import type { NextStep } from "@/lib/workflow";

const SHORT: Record<NextStep["step"], string> = { photos: "Faltam fotos", create: "Criar imagens", review: "Para escolher", publish: "Exportar" };

/** One short tag saying where the product is in the flow. */
export function ProductStatus({ next }: { next: NextStep }) {
  const [tone, label]: [BadgeTone, string] =
    next.tone === "waiting" ? ["warning", "Criando…"] : next.tone === "done" ? ["success", next.cta ? "Arquivos prontos" : "Pronto"] : ["neutral", SHORT[next.step]];
  return (
    <Badge tone={tone} dot={tone !== "neutral"}>
      {label}
    </Badge>
  );
}
