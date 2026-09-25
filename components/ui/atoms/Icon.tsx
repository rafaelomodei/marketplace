import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Thin line icon (lucide), matching the hairline style of the system. */
export function Icon({ icon: Glyph, className }: { icon: LucideIcon; className?: string }) {
  return <Glyph aria-hidden strokeWidth={1.5} className={cn("size-4 shrink-0", className)} />;
}

const TILE_TONES = {
  peach: "bg-peach",
  rose: "bg-rose",
  lilac: "bg-lilac",
  mint: "bg-mint",
  sun: "bg-sun",
  sky: "bg-sky",
  neutral: "bg-panel",
} as const;
export type TileTone = keyof typeof TILE_TONES;

/** Icon on a soft pastel square, used for features, modes and steps. */
export function IconTile({ icon, tone = "neutral", size = "md" }: { icon: LucideIcon; tone?: TileTone; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-7 rounded-lg", md: "size-10 rounded-xl", lg: "size-14 rounded-2xl" }[size];
  const glyph = { sm: "size-3.5", md: "size-5", lg: "size-6" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center text-ink-strong/80", box, TILE_TONES[tone])}>
      <Icon icon={icon} className={glyph} />
    </span>
  );
}
