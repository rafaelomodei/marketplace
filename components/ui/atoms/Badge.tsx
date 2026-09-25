import { cn } from "@/lib/cn";

const TONES = {
  neutral: "bg-surface text-ink-soft ring-line",
  accent: "bg-canvas/70 text-ink-strong ring-line backdrop-blur",
  success: "bg-success-soft text-success ring-success/15",
  warning: "bg-warning-soft text-warning ring-warning/15",
  danger: "bg-danger-soft text-danger ring-danger/15",
  dark: "bg-ink-strong/80 text-white ring-white/10 backdrop-blur",
} as const;

const DOTS: Partial<Record<keyof typeof TONES, string>> = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" };

export type BadgeTone = keyof typeof TONES;

/** Small rounded label. `dot` shows the square status marker used in section eyebrows. */
export function Badge({ children, tone = "neutral", dot, className }: { children: React.ReactNode; tone?: BadgeTone; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-[2px]", DOTS[tone] ?? "bg-ink-muted")} />}
      {children}
    </span>
  );
}
