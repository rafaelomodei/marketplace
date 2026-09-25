import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

/** Collapsed section for things most people can skip (advanced options, technical details). */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group/disclosure", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-ink-muted select-none hover:text-ink-strong [&::-webkit-details-marker]:hidden">
        {summary}
        <Icon icon={ChevronDown} className="size-3.5 transition group-open/disclosure:rotate-180" />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}
