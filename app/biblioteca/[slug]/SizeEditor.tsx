"use client";

import { useEffect, useState } from "react";
import { Alert, Code, Field, Input, NumberStepper } from "@/components/ui";
import type { ObjectSize } from "@/lib/library";
import type { Dimensions } from "@/lib/print-files";
import { formatMm, formatSize } from "@/lib/text";

const AXES = [
  ["width", "Largura"],
  ["depth", "Comprimento"],
  ["height", "Altura"],
] as const;

type Texts = Record<keyof Dimensions, string>;
const toTexts = (d: Dimensions | null): Texts => ({ width: d ? formatMm(d.width) : "", depth: d ? formatMm(d.depth) : "", height: d ? formatMm(d.height) : "" });
const toMm = (s: string) => Math.round(Number(s.trim().replace(",", ".")) * 10) / 10;

/**
 * Size in mm and number of pieces of the finished object. A single-piece model is measured
 * automatically; with several pieces the user informs it, since pieces may fit into each other.
 */
export function SizeEditor({ object, manualSize, manualPieces, onSave }: {
  object: ObjectSize;
  manualSize: Dimensions | null;
  manualPieces: number | null;
  onSave: (patch: { size?: Dimensions | null; pieces?: number | null }) => void;
}) {
  const [texts, setTexts] = useState<Texts>(toTexts(manualSize));
  useEffect(() => setTexts(toTexts(manualSize)), [JSON.stringify(manualSize)]); // eslint-disable-line react-hooks/exhaustive-deps
  const measured = object.measured;
  const placeholder = toTexts(measured?.size ?? null);

  const commit = () => {
    if (!texts.width.trim() && !texts.depth.trim() && !texts.height.trim()) return manualSize && onSave({ size: null });
    const size = { width: toMm(texts.width), depth: toMm(texts.depth), height: toMm(texts.height) };
    if (Object.values(size).every((n) => Number.isFinite(n) && n > 0) && JSON.stringify(size) !== JSON.stringify(manualSize)) onSave({ size });
  };

  return (
    <div className="space-y-5">
      {!manualSize && measured && measured.pieces > 1 && (
        <Alert tone="warning">Este arquivo tem {measured.pieces} peças. Informe o tamanho do objeto montado, porque não dá para saber como elas se encaixam ou se são várias cópias.</Alert>
      )}
      {!manualSize && measured?.size && measured.pieces === 1 && (
        <p className="text-sm text-ink-soft">
          Medido no arquivo: <strong className="font-medium text-ink-strong">{formatSize(measured.size)}</strong> (uma peça). Preencha só se o tamanho real for outro.
        </p>
      )}
      {manualSize && measured?.size && (
        <p className="text-sm text-ink-muted">
          No arquivo: {formatSize(measured.size)}.{" "}
          <button type="button" className="underline-offset-2 hover:text-ink-strong hover:underline" onClick={() => onSave({ size: null })}>Usar o medido</button>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && commit()}>
        {AXES.map(([key, label]) => (
          <Field key={key} label={label}>
            <div className="relative">
              <Input
                value={texts[key]}
                inputMode="decimal"
                placeholder={placeholder[key] || "0"}
                aria-label={`${label} em milímetros`}
                onChange={(e) => setTexts({ ...texts, [key]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="pr-12 tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-ink-muted">mm</span>
            </div>
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-strong">Peças por objeto</span>
        <NumberStepper value={manualPieces ?? 1} onChange={(v) => onSave({ pieces: v })} min={1} max={500} step={1} label="peças impressas que formam um objeto" />
        <span className="text-xs text-ink-muted">Quantas peças impressas formam um objeto pronto (ex.: foto + moldura + laço = 3). Com isso, uma mesa de 27 peças rende 9 objetos.</span>
      </div>
      {measured && <p className="text-xs text-ink-muted">Medição feita em <Code>{measured.file}</Code></p>}
    </div>
  );
}
