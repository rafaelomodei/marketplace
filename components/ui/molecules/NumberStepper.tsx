"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

const round = (v: number, step: number) => {
  const decimals = String(step).split(".")[1]?.length ?? 0;
  return Number(v.toFixed(decimals));
};

/** Compact number field with − / + buttons and a unit ("0,8 mm"). Typing accepts comma or dot. */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  label,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  label: string;
  className?: string;
}) {
  const decimals = String(step).split(".")[1]?.length ?? 0;
  const show = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const clamp = (v: number) => round(Math.min(max, Math.max(min, v)), step);
  const commit = () => {
    const v = Number(text.replace(",", "."));
    if (Number.isFinite(v)) onChange(clamp(v));
    else setText(show(value));
  };
  const btn = "grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-surface hover:text-ink-strong disabled:opacity-30";
  return (
    <div className={cn("inline-flex h-10 items-center gap-0.5 rounded-full bg-canvas px-1 ring-1 ring-line-strong ring-inset", className)}>
      <button type="button" aria-label={`Diminuir ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <Icon icon={Minus} className="size-3.5" />
      </button>
      <label className="flex items-baseline gap-1 px-1">
        <span className="sr-only">{label}</span>
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="w-11 bg-transparent text-right font-mono text-sm text-ink-strong tabular-nums outline-none"
        />
        {unit && <span className="text-xs text-ink-muted">{unit}</span>}
      </label>
      <button type="button" aria-label={`Aumentar ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        <Icon icon={Plus} className="size-3.5" />
      </button>
    </div>
  );
}
