"use client";

import { cn } from "@/lib/cn";
import { fontUrl, LAB_FONTS, LAB_ICON_FONT } from "@/lib/lab/fonts";

/** Loads the Lab fonts in the browser under a "lab-" prefix so previews match the 3D model. */
export function LabFontFaces() {
  const css = [...LAB_FONTS, { family: "icons", file: LAB_ICON_FONT.file }]
    .map((f) => `@font-face{font-family:"lab-${f.family}";src:url("${fontUrl(f)}") format("truetype");font-display:swap}`)
    .join("");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/** Grid of fonts, each one showing the customer's own text. */
export function FontPicker({ value, onChange, preview }: { value: string; onChange: (family: string) => void; preview: string }) {
  const sample = preview.trim() || "Nome";
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-2">
      {LAB_FONTS.map((f) => {
        const on = f.family === value;
        return (
          <button
            key={f.family}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(f.family)}
            className={cn(
              "flex min-w-0 flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition",
              on ? "bg-ink-strong text-white" : "bg-surface text-ink-strong hover:bg-panel/70",
            )}
          >
            <span className="w-full truncate text-xl leading-tight" style={{ fontFamily: `"lab-${f.family}", var(--font-sans)` }}>
              {sample}
            </span>
            <span className={cn("text-[11px]", on ? "text-white/60" : "text-ink-muted")}>
              {f.family} · {f.style}
            </span>
          </button>
        );
      })}
    </div>
  );
}
