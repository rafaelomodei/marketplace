import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return <span aria-label="carregando" className={cn("inline-block size-4 animate-spin rounded-full border-[1.5px] border-current border-r-transparent", className)} />;
}
