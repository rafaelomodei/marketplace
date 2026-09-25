import { Frame, Palette, Sparkles, SunMedium, type LucideIcon } from "lucide-react";
import type { TileTone } from "@/components/ui";
import { JOB_TYPE_LABEL, type JobType } from "@/lib/prompts";

/** How each generation mode is presented to the seller. Labels come from lib/prompts. */
export const MODE_UI: Record<JobType, { icon: LucideIcon; tone: TileTone; title: string; description: string }> = {
  "white-bg": {
    icon: SunMedium,
    tone: "sun",
    title: JOB_TYPE_LABEL["white-bg"],
    description: "Foto limpa em fundo branco, com luz de estúdio. É a foto principal do anúncio.",
  },
  scene: {
    icon: Sparkles,
    tone: "rose",
    title: "No cenário",
    description: "Coloca o produto numa foto de ambiente que você escolheu, sem mudar o resto da cena.",
  },
  recolor: {
    icon: Palette,
    tone: "lilac",
    title: "Outras cores",
    description: "Mostra o mesmo produto em outras cores de filamento, sem imprimir de novo.",
  },
  reframe: {
    icon: Frame,
    tone: "sky",
    title: JOB_TYPE_LABEL.reframe,
    description: "Estende a imagem para outro formato em vez de cortar.",
  },
};
