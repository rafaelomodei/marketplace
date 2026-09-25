"use client";

import { ChoiceGroup, Field, Input, RangeField } from "@/components/ui";
import { listValue, visibleOptions, type Param, type ParamValues } from "@/lib/lab/params";
import { findIcon } from "@/lib/lab/fonts";
import { FontPicker } from "./FontPicker";
import { IconPicker } from "./IconPicker";

/** Renders the right control for any Lab parameter, so new tools get their form for free. */
export function ParamControl({ param: p, values, onChange }: { param: Param; values: ParamValues; onChange: (id: string, v: string | number) => void }) {
  const value = values[p.id];
  switch (p.type) {
    case "text":
      return (
        <Field label={p.label} hint={`${String(value).length}/${p.maxLength} caracteres`}>
          <Input value={String(value)} maxLength={p.maxLength} placeholder={p.placeholder} onChange={(e) => onChange(p.id, e.target.value)} className="text-base" />
        </Field>
      );
    case "number":
      return <RangeField label={p.label} hint={p.hint} value={Number(value)} min={p.min} max={p.max} step={p.step} unit={p.unit} onChange={(v) => onChange(p.id, v)} />;
    case "choice":
      return (
        <Field as="div" label={p.label} hint={p.hint}>
          <ChoiceGroup value={String(value)} onChange={(v) => onChange(p.id, v)} options={visibleOptions(p.options, values)} />
        </Field>
      );
    case "multi": {
      const options = visibleOptions(p.options, values);
      // Keep choices that are hidden right now (e.g. "Ícone" without an icon) so they come back when relevant.
      const hidden = listValue(value).filter((v) => !options.some((o) => o.value === v));
      return (
        <Field as="div" label={p.label} hint={p.hint}>
          <ChoiceGroup
            multiple
            value={listValue(value).filter((v) => !hidden.includes(v))}
            onChange={(v) => onChange(p.id, [...v, ...hidden].join(","))}
            options={options}
          />
        </Field>
      );
    }
    case "icon":
      return (
        <div className="space-y-2">
          <span className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-ink-strong">{p.label}</span>
            <span className="text-xs text-ink-muted">{findIcon(String(value))?.label ?? "Nenhum"}</span>
          </span>
          <IconPicker value={String(value)} onChange={(v) => onChange(p.id, v)} />
        </div>
      );
    case "font": {
      // Preview with the text this font is used for (the top line's font shows the top text).
      const text = p.id.startsWith("top") ? values.top_text || values.text : values.text;
      return (
        <div className="space-y-2">
          <span className="block text-sm font-medium text-ink-strong">{p.label}</span>
          <FontPicker value={String(value)} onChange={(v) => onChange(p.id, v)} preview={typeof text === "string" ? text : ""} />
        </div>
      );
    }
  }
}
