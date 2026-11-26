"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Icon, Input } from "@/components/ui";
import type { ColorOption, VariationView } from "@/lib/library";
import { formatMoney } from "@/lib/text";

type Row = { name: string; perKg: string };
const toRow = (c: ColorOption): Row => ({ name: c.name, perKg: c.perKg === null ? "" : c.perKg.toFixed(2).replace(".", ",") });
const num = (s: string) => Number(s.trim().replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

/**
 * Colours whose filament costs something else (silk gold, glow in the dark…): a name and the price of its 1 kg roll.
 * They combine with every variation; the price in each colour shows beside it. Saves on blur.
 */
export function ColorsEditor({ colors, normalPerKg, preview, onSave }: {
  colors: ColorOption[];
  /** Price of the normal filament roll, as a reference. */
  normalPerKg: number | null;
  /** Prices of a product without variations, per colour (variations show theirs on their own card). */
  preview: VariationView["colors"] | null;
  onSave: (colors: ColorOption[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(colors.map(toRow));
  useEffect(() => setRows(colors.map(toRow)), [JSON.stringify(colors)]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next = rows) => {
    const parsed = next
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), perKg: r.perKg.trim() && Number.isFinite(num(r.perKg)) ? Math.round(num(r.perKg) * 100) / 100 : null }));
    if (JSON.stringify(parsed) !== JSON.stringify(colors)) onSave(parsed);
  };
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="hidden grid-cols-[1fr_9rem_1fr_2.25rem] gap-2 px-1 text-xs text-ink-muted sm:grid">
          <span>Cor</span><span>Rolo de 1 kg</span><span /><span />
        </div>
      )}
      {rows.map((r, i) => {
        const p = preview?.find((c) => c.name === r.name.trim());
        return (
          <div key={i} className="grid grid-cols-[1fr_9rem_1fr_2.25rem] items-center gap-2" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && save()}>
            <Input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Ex.: Dourado seda" aria-label="Nome da cor" className="h-10" />
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-ink-muted">R$</span>
              <Input
                value={r.perKg}
                onChange={(e) => set(i, { perKg: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                inputMode="decimal"
                placeholder={normalPerKg !== null ? normalPerKg.toFixed(2).replace(".", ",") : "0,00"}
                aria-label="Preço do rolo de 1 kg desta cor"
                className="h-10 pl-9 text-right tabular-nums"
              />
            </div>
            <span className="min-w-0 text-sm text-ink-soft">
              {p && <>sugerido {formatMoney(p.price)} ({p.surcharge >= 0 ? "+" : "−"}{formatMoney(Math.abs(p.surcharge))} de filamento)</>}
            </span>
            <Button variant="ghost" size="icon" aria-label={`Tirar ${r.name || "cor"}`} onClick={() => { const next = rows.filter((_, j) => j !== i); setRows(next); save(next); }}>
              <Icon icon={X} />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button size="sm" variant="soft" onClick={() => setRows([...rows, { name: "", perKg: "" }])}>
          <Icon icon={Plus} /> Adicionar cor
        </Button>
        {normalPerKg !== null && <span className="text-sm text-ink-muted">Filamento normal: {formatMoney(normalPerKg)} o kg</span>}
      </div>
    </div>
  );
}
