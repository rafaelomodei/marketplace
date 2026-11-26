"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Icon, Input } from "@/components/ui";
import type { SalePrice } from "@/lib/library";
import { formatMoney } from "@/lib/text";

type Row = { quantity: string; price: string };
const money = (n: number) => n.toFixed(2).replace(".", ",");
const toRow = (t: SalePrice): Row => ({ quantity: String(t.quantity), price: money(t.price) });
const parseMoney = (s: string) => Number(s.trim().replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
const valid = (t: { quantity: number; price: number }) => Number.isInteger(t.quantity) && t.quantity > 0 && Number.isFinite(t.price) && t.price >= 0;

/**
 * Sale prices of the finished object by quantity: a single one, a kit of 10… Each row is the price of the whole
 * quantity; the unit price and the profit over the print cost are shown beside it. Saves on blur.
 */
export function SalePricesEditor({ tiers, unitCost, suggested, onSave }: {
  tiers: SalePrice[];
  /** Cost of one finished object (print + extras + labour), when already calculated. */
  unitCost: number | null;
  /** Suggested price of one object. */
  suggested: number | null;
  onSave: (tiers: SalePrice[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(tiers.map(toRow));
  useEffect(() => setRows(tiers.map(toRow)), [JSON.stringify(tiers)]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next = rows) => {
    const parsed = next.map((r) => ({ quantity: Number(r.quantity.trim()), price: Math.round(parseMoney(r.price) * 100) / 100 })).filter(valid);
    if (JSON.stringify(parsed) !== JSON.stringify(tiers)) onSave(parsed);
  };
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = (quantity: number) => {
    const next = [...rows, { quantity: String(quantity), price: suggested !== null ? money(suggested * quantity) : "" }];
    setRows(next);
    if (suggested !== null) save(next);
  };
  const nextQuantity = rows.length === 0 ? 1 : Math.max(...rows.map((r) => Number(r.quantity) || 0)) < 10 ? 10 : Math.max(...rows.map((r) => Number(r.quantity) || 0)) * 2;

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="hidden grid-cols-[6rem_9rem_1fr_2.25rem] gap-2 px-1 text-xs text-ink-muted sm:grid">
          <span>Quantidade</span><span>Preço total</span><span /><span />
        </div>
      )}
      {rows.map((r, i) => {
        const quantity = Number(r.quantity);
        const price = parseMoney(r.price);
        const ok = valid({ quantity, price });
        const profit = ok && unitCost !== null ? price - quantity * unitCost : null;
        return (
          <div key={i} className="grid grid-cols-[6rem_9rem_1fr_2.25rem] items-center gap-2" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && save()}>
            <div className="relative">
              <Input value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value.replace(/\D/g, "") })} inputMode="numeric" aria-label="Quantidade de objetos" className="h-10 pr-10 text-right tabular-nums" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-muted">un.</span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-ink-muted">R$</span>
              <Input
                value={r.price}
                onChange={(e) => set(i, { price: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                inputMode="decimal"
                placeholder={suggested !== null && quantity > 0 ? money(suggested * quantity) : "0,00"}
                aria-label="Preço total da quantidade"
                className="h-10 pl-9 text-right tabular-nums"
              />
            </div>
            <span className="min-w-0 text-sm text-ink-soft">
              {ok && quantity > 1 && <>{formatMoney(price / quantity)} cada · </>}
              {profit !== null && (
                <span className={profit < 0 ? "text-danger" : undefined}>
                  {profit < 0 ? "prejuízo" : "lucro"} de {formatMoney(Math.abs(profit))}{price > 0 ? ` (${Math.round((profit / price) * 100)}%)` : ""}
                </span>
              )}
            </span>
            <Button variant="ghost" size="icon" aria-label={`Tirar preço de ${r.quantity || "?"} un.`} onClick={() => { const next = rows.filter((_, j) => j !== i); setRows(next); save(next); }}>
              <Icon icon={X} />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button size="sm" variant="soft" onClick={() => add(nextQuantity)}>
          <Icon icon={Plus} /> {rows.length === 0 ? "Definir preço de 1 unidade" : "Adicionar kit"}
        </Button>
        {suggested !== null && <span className="text-sm text-ink-muted">Sugerido: {formatMoney(suggested)} por unidade</span>}
      </div>
    </div>
  );
}
