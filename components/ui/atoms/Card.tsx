import { cn } from "@/lib/cn";

const TONES = {
  /** White with hairline — default container. */
  plain: "bg-canvas ring-1 ring-line ring-inset",
  /** Warm off-white fill, no border — grouped content, side panels. */
  surface: "bg-surface",
  /** Deeper warm grey — illustrations, empty states. */
  panel: "bg-panel/70",
  /** Floating on top of imagery. */
  float: "bg-canvas/85 shadow-float ring-1 ring-black/5 backdrop-blur-xl",
} as const;

export function Card({ tone = "plain", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof TONES }) {
  return <div className={cn("rounded-card", TONES[tone], className)} {...props} />;
}
