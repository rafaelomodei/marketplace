import { cn } from "@/lib/cn";

export type Choice<T extends string> = { value: T; label: React.ReactNode; hint?: string };

/**
 * Row of pill toggles. Single choice by default; pass `multiple` for checkboxes-as-pills.
 * Replaces radios, segmented controls and checkbox lists.
 */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  multiple,
  className,
}: {
  options: Choice<T>[];
  className?: string;
} & ({ multiple?: false; value: T; onChange: (v: T) => void } | { multiple: true; value: T[]; onChange: (v: T[]) => void })) {
  const isOn = (v: T) => (multiple ? (value as T[]).includes(v) : value === v);
  const pick = (v: T) => {
    if (!multiple) return (onChange as (v: T) => void)(v);
    const list = value as T[];
    (onChange as (v: T[]) => void)(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };
  return (
    <div role={multiple ? "group" : "radiogroup"} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={multiple ? "checkbox" : "radio"}
          aria-checked={isOn(o.value)}
          title={o.hint}
          onClick={() => pick(o.value)}
          className={cn(
            "h-9 rounded-full px-3.5 text-[13px] font-medium transition",
            isOn(o.value) ? "bg-ink-strong text-white" : "bg-canvas text-ink-soft ring-1 ring-line-strong ring-inset hover:text-ink-strong hover:ring-ink-faint",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
