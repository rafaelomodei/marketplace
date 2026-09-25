"use client";

import { Ban } from "lucide-react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { iconGlyph, LAB_ICONS } from "@/lib/lab/fonts";

/** Grid of ready-made icons (drawn with the same font the 3D model uses), plus "none". */
export function IconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const item = (on: boolean) =>
    cn("grid aspect-square place-items-center rounded-xl text-lg transition", on ? "bg-ink-strong text-white" : "bg-surface text-ink-strong hover:bg-panel/70");
  return (
    <div role="radiogroup" className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-6">
      <button type="button" role="radio" aria-checked={value === "none"} title="Sem ícone" aria-label="Sem ícone" onClick={() => onChange("none")} className={item(value === "none")}>
        <Icon icon={Ban} className="size-4" />
      </button>
      {LAB_ICONS.map((i) => (
        <button
          key={i.id}
          type="button"
          role="radio"
          aria-checked={value === i.id}
          title={i.label}
          aria-label={i.label}
          onClick={() => onChange(i.id)}
          className={item(value === i.id)}
          style={{ fontFamily: '"lab-icons"' }}
        >
          {iconGlyph(i)}
        </button>
      ))}
    </div>
  );
}
