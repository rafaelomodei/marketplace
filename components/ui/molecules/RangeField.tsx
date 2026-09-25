import { Slider } from "../atoms/Slider";

/** Label, current value with unit, and a slider. */
export function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const decimals = String(step).split(".")[1]?.length ?? 0;
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink-strong">{label}</span>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          {value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
          {unit && ` ${unit}`}
        </span>
      </span>
      <Slider min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}
