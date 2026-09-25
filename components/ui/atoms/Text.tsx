import { cn } from "@/lib/cn";

const HEADINGS = {
  display: "text-[2.75rem] leading-none tracking-[-0.05em] sm:text-display",
  title: "text-[2rem] leading-tight tracking-[-0.045em] sm:text-title",
  heading: "text-heading",
  subheading: "text-lg tracking-[-0.02em]",
} as const;

/** Headlines are light and tight — the signature of the system. */
export function Heading({
  as: Tag = "h2",
  size = "heading",
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" | "h4"; size?: keyof typeof HEADINGS }) {
  return <Tag className={cn("font-normal text-ink-strong text-balance", HEADINGS[size], className)} {...props} />;
}

export function Lead({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-lead text-ink-muted text-pretty", className)} {...props} />;
}

export function Muted({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ink-muted", className)} {...props} />;
}

/** Monospace detail: folder paths, ids, technical values. */
export function Code({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <code className={cn("font-mono text-[12px] text-ink-muted", className)} {...props} />;
}
