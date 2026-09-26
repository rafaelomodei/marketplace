"use client";

import { ArrowRight } from "lucide-react";
import { Icon, Swatch } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { LabToolState } from "../useLabTool";
import { FilamentButton } from "./FilamentButton";
import type { DesignEditor } from "./useDesignEditor";

/** "Cores" panel: each color of the drawing → the filament it prints with (plus the base), and how many filaments. */
export function ColorsPanel({ t, e }: { t: LabToolState; e: DesignEditor }) {
  const shown = e.layers.filter((l) => !l.hidden);
  const filaments = new Set([t.colorOf("base"), ...shown.map((l) => t.colorOf(l.id, l.hex))].map((c) => c.filamentId ?? c.hex));
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ink-muted">
        Cada cor do desenho imprime com um filamento. Cores com o mesmo filamento saem da mesma bobina.{" "}
        <span className="font-medium text-ink-strong">
          {filaments.size} {filaments.size === 1 ? "filamento" : "filamentos"} no total.
        </span>
      </p>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-3 rounded-xl bg-surface p-2 pl-3">
          <span className="flex-1 text-sm font-medium text-ink-strong">Base e borda</span>
          <FilamentButton label="Filamento da base" align="end" catalog={t.catalog} value={t.colorOf("base")} onChange={(c) => t.setColor("base", c)} />
        </li>
        {shown.map((l) => {
          const on = e.selection?.kind === "color" && e.selection.hex === l.hex;
          return (
            <li key={l.hex} className={cn("flex items-center gap-3 rounded-xl bg-surface p-2 pl-3 transition", on && "ring-1 ring-ink-strong")}>
              <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => e.setSelection({ kind: "color", hex: l.hex })} title="Selecionar esta cor">
                <Swatch color={l.hex} className="size-6" />
                <Icon icon={ArrowRight} className="size-3.5 text-ink-faint" />
                <span className="text-sm font-medium text-ink-strong">Cor {l.index + 1}</span>
              </button>
              <FilamentButton label={`Filamento da cor ${l.index + 1}`} align="end" catalog={t.catalog} value={t.colorOf(l.id, l.hex)} onChange={(c) => t.setColor(l.id, c)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
