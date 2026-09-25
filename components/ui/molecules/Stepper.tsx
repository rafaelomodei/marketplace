import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

export type Step<T extends string> = { id: T; label: string; done?: boolean; badge?: React.ReactNode };

/** Numbered steps on a hairline; the current one is dark, finished ones get a check. */
export function Stepper<T extends string>({ steps, current, onSelect }: { steps: Step<T>[]; current: T; onSelect: (id: T) => void }) {
  return (
    <nav aria-label="Etapas" className="-mx-4 overflow-x-auto px-4">
      <ol className="flex min-w-max items-center gap-1 border-b border-line">
        {steps.map((s, i) => {
          const active = s.id === current;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "-mb-px flex h-12 items-center gap-2.5 border-b-[1.5px] px-3 text-sm transition",
                  active ? "border-ink-strong text-ink-strong" : "border-transparent text-ink-muted hover:text-ink-strong",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs tabular-nums transition",
                    active ? "bg-ink-strong text-white" : s.done ? "bg-mint text-success" : "bg-surface ring-1 ring-line-strong ring-inset",
                  )}
                >
                  {s.done && !active ? <Icon icon={Check} className="size-3.5" /> : i + 1}
                </span>
                <span className="font-medium">{s.label}</span>
                {s.badge}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
