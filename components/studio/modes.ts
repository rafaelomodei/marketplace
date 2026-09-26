import { Box, Frame, Palette, Sparkles, SunMedium, Theater, type LucideIcon } from "lucide-react";
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
  "from-3d": {
    icon: Box,
    tone: "mint",
    title: "Foto real do 3D",
    description: "Transforma o modelo 3D do Lab em fotos da peça já impressa, com camadas e acabamento de verdade.",
  },
  staged: {
    icon: Theater,
    tone: "peach",
    title: JOB_TYPE_LABEL.staged,
    description: "Mostra o produto sendo usado numa cena que você descreve — sem precisar de foto de cenário.",
  },
};
