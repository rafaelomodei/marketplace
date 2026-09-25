import { cn } from "@/lib/cn";

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-3.5 shrink-0 rounded-full ring-1 ring-black/10 ring-inset", className)} style={{ background: color }} />;
}
