"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Icon, Input, NumberStepper } from "@/components/ui";
import type { Extra } from "@/lib/costing";
import { formatMoney } from "@/lib/text";

type Row = { name: string; quantity: string; unitCost: string };
const toRow = (e: Extra): Row => ({ name: e.name, quantity: String(e.quantity).replace(".", ","), unitCost: e.unitCost.toFixed(2).replace(".", ",") });
const num = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", "."));
const isExtra = (e: { name: string; quantity: number; unitCost: number }) => !!e.name.trim() && e.quantity > 0 && Number.isFinite(e.unitCost) && e.unitCost >= 0;

/** What goes with each piece besides the print (key ring, bag, box…) and the hands-on minutes. Saves on blur. */
export function ExtrasEditor({
  extras,
  laborMinutes,
  defaultLaborMinutes,
  onSave,
}: {
  extras: Extra[];
  laborMinutes: number | null;
  defaultLaborMinutes: number;
  onSave: (patch: { extras?: Extra[]; laborMinutes?: number | null }) => void;
}) {
  const [rows, setRows] = useState<Row[]>(extras.map(toRow));
  useEffect(() => setRows(extras.map(toRow)), [JSON.stringify(extras)]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next = rows) => {
    const parsed = next.map((r) => ({ name: r.name.trim(), quantity: num(r.quantity), unitCost: num(r.unitCost) })).filter(isExtra);
    if (JSON.stringify(parsed) !== JSON.stringify(extras)) onSave({ extras: parsed });
  };
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((n, r) => n + (num(r.quantity) || 0) * (num(r.unitCost) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {rows.length > 0 && (
          <div className="hidden grid-cols-[1fr_5rem_7rem_2.25rem] gap-2 px-1 text-xs text-ink-muted sm:grid">
            <span>Item</span><span>Qtd. por peça</span><span>Custo unitário</span><span />
          </div>
        )}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_7rem_2.25rem] gap-2" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && save()}>
            <Input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Ex.: argola de chaveiro" aria-label="Item" className="h-10" />
            <Input value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} inputMode="decimal" aria-label="Quantidade por peça" className="h-10 text-right" />
            <Input value={r.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} inputMode="decimal" aria-label="Custo unitário em reais" className="h-10 text-right" />
            <Button variant="ghost" size="icon" aria-label={`Tirar ${r.name || "item"}`} onClick={() => { const next = rows.filter((_, j) => j !== i); setRows(next); save(next); }}>
              <Icon icon={X} />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <Button size="sm" variant="soft" onClick={() => setRows([...rows, { name: "", quantity: "1", unitCost: "0,00" }])}>
            <Icon icon={Plus} /> Adicionar item
          </Button>
          {rows.length > 0 && <span className="text-sm text-ink-muted">Total por peça: {formatMoney(total)}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-strong">Mão de obra por peça</span>
        <NumberStepper value={laborMinutes ?? defaultLaborMinutes} onChange={(v) => onSave({ laborMinutes: v })} min={0} max={600} step={1} unit="min" label="minutos de mão de obra" />
        {laborMinutes !== null && laborMinutes !== defaultLaborMinutes && (
          <button type="button" onClick={() => onSave({ laborMinutes: null })} className="text-xs text-ink-muted hover:text-ink-strong">
            Usar o padrão ({defaultLaborMinutes} min)
          </button>
        )}
      </div>
    </div>
  );
}
