import Link from "next/link";
import { cn } from "@/lib/cn";

const VARIANTS = {
  /** Dark pill: the one main action of a view. */
  primary: "bg-ink-strong text-white hover:bg-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
  /** White pill with hairline: secondary actions. */
  secondary: "bg-canvas text-ink-strong ring-1 ring-line-strong ring-inset hover:bg-surface",
  /** Warm grey fill: toggles and quiet actions. */
  soft: "bg-panel/70 text-ink hover:bg-panel",
  ghost: "text-ink-soft hover:bg-surface hover:text-ink-strong",
  success: "bg-success text-white hover:brightness-110",
  danger: "text-danger ring-1 ring-danger/25 ring-inset hover:bg-danger-soft",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
  icon: "size-9 justify-center",
} as const;

export type ButtonStyle = { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES; className?: string };

export const buttonClass = ({ variant = "secondary", size = "md", className }: ButtonStyle) =>
  cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-[-0.01em] whitespace-nowrap transition",
    "disabled:pointer-events-none disabled:opacity-40",
    VARIANTS[variant],
    SIZES[size],
    className,
  );

export function Button({ variant, size, className, type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: React.ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />;
}
