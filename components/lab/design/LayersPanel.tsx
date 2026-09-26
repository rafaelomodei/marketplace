"use client";

import { Eye, EyeOff, Layers, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { FloatingPanel, Icon, Swatch } from "@/components/ui";
import { cn } from "@/lib/cn";
import { mm } from "../ModelParts";
import type { LabToolState } from "../useLabTool";
import type { DesignEditor } from "./useDesignEditor";

/** Left panel: the base and every color as a layer — click to select, eye to show/hide, height at a glance. */
export function LayersPanel({ t, e, onClose }: { t: LabToolState; e: DesignEditor; onClose: () => void }) {
  const sel = e.selection;
  const visible = e.layers.filter((l) => !l.hidden).length;
  const row = (on: boolean) =>
    cn("group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition", on ? "bg-ink-strong text-white" : "hover:bg-surface");

  return (
    <FloatingPanel title={<span className="flex items-center gap-2"><Icon icon={Layers} /> Camadas</span>} onClose={onClose} className="w-64">
      <div className="-m-2 space-y-0.5">
        <button type="button" className={row(sel?.kind === "base")} onClick={() => e.setSelection({ kind: "base" })}>
          <Swatch color={t.colorOf("base").hex} className="size-6" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">Base e borda</span>
            <span className={cn("block text-[11px]", sel?.kind === "base" ? "text-white/60" : "text-ink-muted")}>{mm(Number(t.values.base_thickness))} mm de espessura</span>
          </span>
        </button>
        {e.layers.map((l) => {
          const on = sel?.kind === "color" && sel.hex === l.hex;
          const hiddenShapes = e.shapesOf(l.hex).filter((s) => e.design?.shapes?.[s.index]?.hidden).length;
          return (
            <div key={l.hex} className={cn(row(on), l.hidden && "opacity-50")}>
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => e.setSelection({ kind: "color", hex: l.hex })}>
                <span className="relative">
                  <Swatch color={t.colorOf(l.id, l.hex).hex} className="size-6" />
                  {/* The color it has in the drawing. */}
                  <Swatch color={l.hex} className="absolute -right-1 -bottom-1 size-3 ring-2 ring-canvas" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[13px] font-medium">
                    Cor {l.index + 1}
                    {l.custom && <Icon icon={SlidersHorizontal} className={cn("size-3", on ? "text-white/60" : "text-ink-muted")} />}
                  </span>
                  <span className={cn("block text-[11px]", on ? "text-white/60" : "text-ink-muted")}>
                    {l.hidden ? "Escondida" : `${l.height ? `+${mm(l.height)} mm` : "Rente"} · ${l.shapes} ${l.shapes === 1 ? "forma" : "formas"}`}
                  </span>
                </span>
              </button>
              {hiddenShapes > 0 && !l.hidden && (
                <button type="button" title={`Mostrar ${hiddenShapes} forma(s) escondida(s)`} onClick={() => e.showShapes(l.hex)} className="text-[11px] underline opacity-70 hover:opacity-100">
                  +{hiddenShapes}
                </button>
              )}
              <button
                type="button"
                title={l.hidden ? "Mostrar esta cor" : "Esconder esta cor"}
                aria-label={l.hidden ? "Mostrar esta cor" : "Esconder esta cor"}
                disabled={!l.hidden && visible === 1}
                onClick={() => e.setHidden(!l.hidden, { kind: "color", hex: l.hex })}
                className={cn("grid size-7 place-items-center rounded-full transition disabled:opacity-30", on ? "hover:bg-white/10" : "text-ink-muted hover:bg-panel hover:text-ink-strong")}
              >
                <Icon icon={l.hidden ? EyeOff : Eye} className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {!!e.art?.warnings.length && (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-warning">
          {e.art.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <Icon icon={TriangleAlert} className="mt-0.5 size-3" /> {w}
            </li>
          ))}
        </ul>
      )}
    </FloatingPanel>
  );
}
