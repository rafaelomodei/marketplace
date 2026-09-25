import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

export type Feature = { icon: LucideIcon; title: string; description: string };

/** Columns split by hairlines, thin icon on top — the "value props" row. */
export function FeatureGrid({ features, className }: { features: Feature[]; className?: string }) {
  return (
    <div className={cn("grid border-t border-line sm:grid-cols-2 lg:grid-cols-4", className)}>
      {features.map((f, i) => (
        <div key={f.title} className={cn("space-y-3 py-8 sm:px-6", i > 0 && "lg:border-l lg:border-line", i % 2 === 1 && "sm:border-l sm:border-line lg:border-l", i === 0 && "sm:pl-0")}>
          <Icon icon={f.icon} className="size-7 text-ink-strong" />
          <h3 className="pt-3 font-medium tracking-[-0.01em] text-ink-strong">{f.title}</h3>
          <p className="text-sm leading-relaxed text-ink-muted">{f.description}</p>
        </div>
      ))}
    </div>
  );
}
