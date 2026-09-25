import { cn } from "@/lib/cn";

/** Page width + side gutters. `narrow` for reading-width content. */
export function Container({ narrow, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { narrow?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-8", narrow ? "max-w-4xl" : "max-w-6xl", className)} {...props} />;
}
