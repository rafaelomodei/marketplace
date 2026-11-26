"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ChoiceGroup, Disclosure, Field, Icon, InlineEdit, Input, Spinner } from "@/components/ui";
import { action, libraryPictureUrl, reportError } from "@/lib/client/api";
import type { LibraryFile, VariationView } from "@/lib/library";
import { formatDuration, formatGrams, formatMoney, formatSize } from "@/lib/text";
import { SalePricesEditor } from "./SalePricesEditor";

const fileLabel = (f: LibraryFile) => f.name.replace(/\.(3mf|stl)$/i, "");

/** "15 cm" from the height of a one-piece model; otherwise nothing to suggest. */
function suggestTitle(f: LibraryFile | undefined) {
  const h = f?.measure?.pieces === 1 ? f.measure.size?.height : undefined;
  return h ? `${(Math.round(h / 5) * 5) / 10} cm`.replace(".", ",") : "";
}

/**
 * Versions of the same product (sizes and/or features), each with its own 3MF file(s), cost and suggested price.
 * Adding one is just picking the file and typing a title; files, labels and prices sit under "Detalhes".
 */
export function VariationsSection({ slug, variations, files, onChanged }: {
  slug: string;
  variations: VariationView[];
  /** Ready-to-print files of the project. */
  files: LibraryFile[];
  onChanged: () => void;
}) {
  const used = new Set(variations.flatMap((v) => v.files));
  const firstFree = files.find((f) => !used.has(f.rel)) ?? files[0];
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<string>("");
  const [title, setTitle] = useState("");
  const chosen = files.find((f) => f.rel === file) ?? firstFree;

  const run = async (name: string, input: Record<string, unknown>) => {
    try {
      await action(name, { project: slug, ...input });
      onChanged();
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim() || suggestTitle(chosen);
    if (!name) return;
    if (await run("add_library_variation", { title: name, files: chosen ? [chosen.rel] : [] })) {
      setTitle("");
      setFile("");
      setAdding(false);
    }
  }

  return (
    <div className="space-y-3">
      {variations.length === 0 && !adding && (
        <p className="text-sm text-ink-muted">Produto único. Vende em outro tamanho ou com outra base? Crie uma variação para cada versão, inclusive a original.</p>
      )}
      {variations.map((v) => (
        <VariationCard key={v.id} slug={slug} variation={v} files={files} run={run} />
      ))}
      {adding ? (
        <Card tone="surface" className="space-y-4 p-4">
          <form onSubmit={add} className="space-y-4">
            {files.length > 0 ? (
              <Field as="div" label="Arquivo desta variação">
                <ChoiceGroup options={files.map((f) => ({ value: f.rel, label: fileLabel(f), hint: f.info?.printer ?? undefined }))} value={chosen?.rel ?? ""} onChange={setFile} />
              </Field>
            ) : (
              <p className="text-sm text-ink-muted">Ainda não há arquivo pronto para imprimir; dá para escolher depois em “Detalhes”.</p>
            )}
            <Field label="Nome da variação" hint="Como o cliente vê: “15 cm”, “Base redonda”, “15 cm base redonda”.">
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestTitle(chosen) || "Ex.: 15 cm"} maxLength={60} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={!title.trim() && !suggestTitle(chosen)}>
                <Icon icon={Plus} /> Adicionar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
          <Icon icon={Plus} /> Adicionar variação
        </Button>
      )}
    </div>
  );
}

function VariationCard({ slug, variation: v, files, run }: {
  slug: string;
  variation: VariationView;
  files: LibraryFile[];
  run: (name: string, input: Record<string, unknown>) => Promise<boolean>;
}) {
  const update = (patch: Record<string, unknown>) => run("update_library_variation", { variation: v.id, ...patch });
  const [size, setSize] = useState(v.size);
  const [feature, setFeature] = useState(v.feature);
  useEffect(() => (setSize(v.size), setFeature(v.feature)), [v.size, v.feature]);
  const first = v.files[0];
  const unit = v.salePrices.find((t) => t.quantity === 1)?.price ?? null;
  // Files picked earlier that are no longer ready still show, so they can be unticked.
  const options = [...files.map((f) => ({ value: f.rel, label: fileLabel(f), hint: f.info?.printer ?? undefined })),
    ...v.files.filter((rel) => !files.some((f) => f.rel === rel)).map((rel) => ({ value: rel, label: rel.split("/").pop()!.replace(/\.(3mf|stl)$/i, "") }))];

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-surface">
          {first && <img src={libraryPictureUrl(slug, first, 1, 160)} alt="" loading="lazy" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-lg tracking-[-0.02em]">
            <InlineEdit value={v.title} label="Nome da variação" maxLength={60} onChange={(title) => update({ title })} />
          </div>
          <p className="text-sm text-ink-muted">
            {v.status === "empty" && "Escolha o arquivo em “Detalhes”"}
            {v.status === "calculating" && <span className="inline-flex items-center gap-1.5"><Spinner className="size-3.5" /> Calculando custo…</span>}
            {v.status === "waiting" && "O arquivo ainda não foi calculado (veja em Prontos para imprimir)"}
            {v.status === "done" && [
              v.files.length > 1 ? `${v.options[0]?.files.length ?? v.files.length} partes` : null,
              v.grams !== null ? formatGrams(v.grams) : null,
              v.seconds !== null ? formatDuration(v.seconds) : null,
              v.measured ? formatSize(v.measured) : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        {v.cost && (
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-xs text-ink-muted">Custo</div>
              <div className="text-ink-strong tabular-nums">{formatMoney(v.cost.total)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">{unit !== null ? "Vende por" : "Sugerido"}</div>
              <div className="text-xl tracking-[-0.02em] text-ink-strong tabular-nums">{formatMoney(unit ?? v.cost.price)}</div>
            </div>
          </div>
        )}
      </div>

      {v.colors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {v.colors.map((c) => (
            <span key={c.name} title={`Custo ${formatMoney(c.total)}`}><Badge>{c.name}: sugerido {formatMoney(c.price)}</Badge></span>
          ))}
        </div>
      )}

      <Disclosure summary="Detalhes">
        <div className="space-y-5">
          <Field as="div" label="Arquivos" hint="Marque mais de um quando a peça é impressa em partes (ex.: corpo + base). Arquivos de impressoras diferentes contam como alternativas.">
            <ChoiceGroup multiple options={options} value={v.files} onChange={(next) => update({ files: next })} />
          </Field>
          {v.options.length > 1 && (
            <ul className="space-y-1 text-sm text-ink-soft">
              {v.options.map((o) => (
                <li key={o.printer}>{o.printer}: {o.cost ? `custo ${formatMoney(o.cost.total)} · sugerido ${formatMoney(o.cost.price)}` : "calculando…"}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tamanho" hint="Para o anúncio. Ex.: 15 cm" optional>
              <Input value={size} onChange={(e) => setSize(e.target.value)} onBlur={() => size.trim() !== v.size && update({ size })} />
            </Field>
            <Field label="Característica" hint="O que muda além do tamanho. Ex.: Base redonda" optional>
              <Input value={feature} onChange={(e) => setFeature(e.target.value)} onBlur={() => feature.trim() !== v.feature && update({ feature })} />
            </Field>
          </div>
          <Field as="div" label="Preço de venda desta variação" optional>
            <SalePricesEditor tiers={v.salePrices} unitCost={v.cost?.total ?? null} suggested={v.cost?.price ?? null} onSave={(salePrices) => update({ salePrices })} />
          </Field>
          <Button variant="ghost" size="sm" onClick={() => run("remove_library_variation", { variation: v.id })}>
            <Icon icon={Trash2} /> Tirar variação
          </Button>
        </div>
      </Disclosure>
    </Card>
  );
}
