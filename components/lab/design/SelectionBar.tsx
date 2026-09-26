"use client";

import { EyeOff, Plus, RotateCcw, X } from "lucide-react";
import { Icon, NumberStepper, Swatch } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { LabToolState } from "../useLabTool";
import { FilamentButton } from "./FilamentButton";
import type { DesignEditor } from "./useDesignEditor";

const Label = ({ children }: { children: React.ReactNode }) => <span className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{children}</span>;
const Sep = () => <span aria-hidden className="hidden h-8 w-px bg-line sm:block" />;

/**
 * Floating bar for what is selected (in 3D or 2D): its filament, the color it belongs to and its relief height —
 * the quick way to edit right where you clicked.
 */
export function SelectionBar({ t, e }: { t: LabToolState; e: DesignEditor }) {
  const sel = e.selection;
  if (!sel) return null;
  const iconBtn = "grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-surface hover:text-ink-strong";

  if (sel.kind === "base")
    return (
      <Bar onClose={() => e.setSelection(null)} title="Base e borda">
        <FilamentButton label="Filamento da base" catalog={t.catalog} value={t.colorOf("base")} onChange={(c) => t.setColor("base", c)} />
        <Sep />
        <span className="flex items-center gap-2">
          <Label>Espessura</Label>
          <NumberStepper label="espessura da base" value={Number(t.values.base_thickness)} min={1.2} max={8} step={0.2} unit="mm" onChange={(v) => t.set("base_thickness", v, { merge: "base_thickness" })} />
        </span>
        <span className="flex items-center gap-2">
          <Label>Borda</Label>
          <NumberStepper label="borda" value={Number(t.values.border)} min={0} max={5} step={0.2} unit="mm" onChange={(v) => t.set("border", v, { merge: "border" })} />
        </span>
      </Bar>
    );

  const layer = sel.kind === "color" ? e.layerOf(sel.hex) : e.layerOf(e.selectedShapes[0]?.color ?? "");
  const count = e.selectedShapes.length;
  const current = sel.kind === "color" ? sel.hex : e.selectedShapes.every((s) => s.color === e.selectedShapes[0]?.color) ? e.selectedShapes[0]?.color : null;
  const title =
    sel.kind === "color" ? `Cor ${(layer?.index ?? 0) + 1} · ${count} ${count === 1 ? "forma" : "formas"}` : count === 1 ? `1 forma${layer ? ` · Cor ${layer.index + 1}` : ""}` : `${count} formas`;

  return (
    <Bar onClose={() => e.setSelection(null)} title={title}>
      {sel.kind === "color" && layer && (
        <span className="flex items-center gap-2">
          <Label>Filamento</Label>
          <FilamentButton label="Filamento desta cor" catalog={t.catalog} value={t.colorOf(layer.id, layer.hex)} onChange={(c) => t.setColor(layer.id, c)} />
        </span>
      )}
      {/* Move the selection to another color of the drawing (or a new one). */}
      <span className="flex items-center gap-1.5">
        <Label>{sel.kind === "color" ? "Juntar com" : "Cor"}</Label>
        <span className="flex flex-wrap items-center gap-1">
          {e.layers
            .filter((l) => !l.hidden && (sel.kind !== "color" || l.hex !== sel.hex))
            .map((l) => (
              <button
                key={l.hex}
                type="button"
                title={`Cor ${l.index + 1}`}
                aria-label={`Passar para a cor ${l.index + 1}`}
                onClick={() => e.recolor(l.hex)}
                className={cn("rounded-full p-0.5 ring-inset transition", current === l.hex ? "ring-2 ring-ink-strong" : "hover:ring-1 hover:ring-ink-faint")}
              >
                <Swatch color={t.colorOf(l.id, l.hex).hex} className="size-6" />
              </button>
            ))}
          {sel.kind === "shapes" && (
            <FilamentButton label="Nova cor com outro filamento" compact catalog={t.catalog} value={null} onChange={e.recolorNew}>
              <span className="grid size-6 place-items-center rounded-full ring-1 ring-line-strong ring-inset">
                <Icon icon={Plus} className="size-3.5" />
              </span>
            </FilamentButton>
          )}
        </span>
      </span>
      <Sep />
      <span className="flex items-center gap-2">
        <Label>Altura</Label>
        <NumberStepper label="altura do relevo" value={e.selectedHeight} min={0} max={5} step={0.1} unit="mm" onChange={e.setHeight} />
      </span>
      <Sep />
      <span className="flex items-center">
        {sel.kind === "shapes" && e.selectedShapes.some((s) => s.custom) && (
          <button type="button" title="Voltar ao original" aria-label="Voltar ao original" className={iconBtn} onClick={e.resetShapes}>
            <Icon icon={RotateCcw} />
          </button>
        )}
        <button
          type="button"
          title="Esconder (não imprime)"
          aria-label="Esconder"
          className={iconBtn}
          disabled={sel.kind === "color" && e.layers.filter((l) => !l.hidden).length === 1}
          onClick={() => e.setHidden(true)}
        >
          <Icon icon={EyeOff} />
        </button>
      </span>
    </Bar>
  );
}

function Bar({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Seleção"
      className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-canvas/95 py-2 pr-2 pl-4 shadow-lift ring-1 ring-black/5 backdrop-blur-xl"
    >
      <span className="text-sm font-medium text-ink-strong">{title}</span>
      {children}
      <button type="button" aria-label="Limpar seleção" title="Limpar seleção (Esc)" onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink-strong">
        <Icon icon={X} className="size-4" />
      </button>
    </div>
  );
}
