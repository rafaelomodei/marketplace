"use client";

import { Copy, Ellipsis, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { PrintFileCard } from "@/components/studio";
import { Badge, Button, buttonClass, Card, ChoiceGroup, Disclosure, Dropdown, Dropzone, Field, Icon, InlineEdit, Input, MenuItem, Spinner } from "@/components/ui";
import { action, reportError } from "@/lib/client/api";
import type { LibraryFile, Project, VariationView } from "@/lib/library";
import { formatDuration, formatGrams, formatMoney, formatSize } from "@/lib/text";
import { SalePricesEditor } from "./SalePricesEditor";

const fileLabel = (rel: string) => rel.split("/").pop()!.replace(/\.(3mf|stl)$/i, "");

type Run = (name: string, input: Record<string, unknown>) => Promise<boolean>;

/**
 * The product and its versions. Every product is at least one variation (the main one, made with the project); each
 * variation has the same parts: its 3MF files (with cost), its sale prices and, under "Detalhes", size/feature.
 * One variation on screen at a time, picked in the row of pills.
 */
export function VariationsSection({ project, upload, uploading, onChanged }: {
  project: Project;
  /** Sends model files; ready 3MF join `variation`. */
  upload: (files: File[], variation?: string) => Promise<void>;
  uploading: boolean;
  onChanged: () => void;
}) {
  const { variations } = project;
  const [selected, setSelected] = useState(variations[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const current = variations.find((v) => v.id === selected) ?? variations[0];

  const run: Run = async (name, input) => {
    try {
      await action(name, { project: project.slug, ...input });
      onChanged();
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    try {
      const v = await action<{ id: string }>("add_library_variation", { project: project.slug, title: name });
      setSelected(v.id);
      setTitle("");
      setAdding(false);
      onChanged();
    } catch (err) {
      reportError(err);
    }
  }

  if (!current) return null;

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl tracking-[-0.03em] text-ink-strong">{variations.length > 1 ? "Variações" : "Produto"}</h2>
        <p className="text-sm text-ink-muted">
          {variations.length > 1
            ? "Cada versão tem seus arquivos e seu preço."
            : "Arquivos e preço do produto. Vende em outro tamanho ou com outra peça? Adicione uma variação."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {variations.length > 1 && (
          <ChoiceGroup options={variations.map((v) => ({ value: v.id, label: v.title }))} value={current.id} onChange={setSelected} />
        )}
        {adding ? (
          <form onSubmit={add} className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              placeholder="Ex.: 15 cm, Base redonda"
              aria-label="Nome da nova variação"
              maxLength={60}
              className="h-9 w-56 rounded-full"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!title.trim()}>Criar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
          </form>
        ) : (
          <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
            <Icon icon={Plus} /> {variations.length > 1 ? "Nova variação" : "Adicionar variação"}
          </Button>
        )}
      </div>

      <VariationPanel key={current.id} project={project} variation={current} canRemove={variations.length > 1} upload={upload} uploading={uploading} run={run} onChanged={onChanged} />

      {project.loose.length > 0 && (
        <Card tone="surface" className="space-y-3 p-4">
          <p className="text-sm text-ink-strong">
            {project.loose.length === 1 ? "Um arquivo pronto ainda não está em nenhuma variação" : `${project.loose.length} arquivos prontos ainda não estão em nenhuma variação`}
          </p>
          <ul className="space-y-2">
            {project.loose.map((rel) => (
              <li key={rel} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink-soft">{fileLabel(rel)}</span>
                <Button size="sm" variant="soft" onClick={() => run("update_library_variation", { variation: current.id, files: [...current.files, rel] })}>
                  Colocar em “{current.title}”
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function VariationPanel({ project, variation: v, canRemove, upload, uploading, run, onChanged }: {
  project: Project;
  variation: VariationView;
  canRemove: boolean;
  upload: (files: File[], variation?: string) => Promise<void>;
  uploading: boolean;
  run: Run;
  onChanged: () => void;
}) {
  const update = (patch: Record<string, unknown>) => run("update_library_variation", { variation: v.id, ...patch });
  const [size, setSize] = useState(v.size);
  const [feature, setFeature] = useState(v.feature);
  useEffect(() => (setSize(v.size), setFeature(v.feature)), [v.size, v.feature]);

  const byRel = new Map(project.files.map((f) => [f.rel, f]));
  const files = v.files.map((rel) => byRel.get(rel)).filter((f): f is LibraryFile => !!f);
  const unit = v.salePrices.find((t) => t.quantity === 1)?.price ?? null;
  const isCover = (rel: string) => !!project.cover && "file" in project.cover && project.cover.file === rel;
  const ready = project.files.filter((f) => f.folder === "print" && f.info?.configured);
  /** Where else each file is used, to tell a shared part apart. */
  const usedIn = (rel: string) => project.variations.filter((x) => x.id !== v.id && x.files.includes(rel)).map((x) => x.title);
  const reusable = ready.filter((f) => !v.files.includes(f.rel));
  const base = project.variations.find((x) => x.id !== v.id && x.files.length);
  const addFiles = (rels: string[]) => update({ files: [...v.files, ...rels.filter((r) => !v.files.includes(r))] });

  const reuseMenu = reusable.length > 0 && (
    <Dropdown
      align="start"
      trigger={(open, toggle) => (
        <Button size="sm" variant="soft" aria-expanded={open} onClick={toggle}>
          <Icon icon={Copy} /> Usar arquivo que já está no projeto
        </Button>
      )}
    >
      {(close) =>
        reusable.map((f) => {
          const where = usedIn(f.rel);
          return (
            <MenuItem key={f.rel} onClick={() => (close(), addFiles([f.rel]))}>
              <span className="min-w-0">
                <span className="block truncate">{fileLabel(f.rel)}</span>
                <span className="block text-xs text-ink-muted">{where.length ? `em ${where.join(", ")}` : "fora de variação"}{f.info?.printer ? ` · ${f.info.printer}` : ""}</span>
              </span>
            </MenuItem>
          );
        })
      }
    </Dropdown>
  );

  const uploadButton = (label: string) => (
    <label className={buttonClass({ variant: "soft", size: "sm", className: "cursor-pointer" })}>
      {uploading ? <Spinner /> : <Icon icon={Upload} />} {label}
      <input type="file" accept=".3mf,.stl" multiple hidden onChange={(e) => (e.target.files?.length && upload(Array.from(e.target.files), v.id), (e.target.value = ""))} />
    </label>
  );

  return (
    <Card className="space-y-8 p-5 sm:p-7">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xl tracking-[-0.02em] text-ink-strong">
            <InlineEdit value={v.title} label="Nome da variação" maxLength={60} onChange={(title) => update({ title })} />
          </div>
          <p className="text-sm text-ink-muted">
            {v.status === "empty" && "Falta o 3MF desta versão"}
            {v.status === "calculating" && <span className="inline-flex items-center gap-1.5"><Spinner className="size-3.5" /> Calculando custo…</span>}
            {v.status === "waiting" && (files.length > 1 ? "Falta calcular alguma parte" : "Aguardando o cálculo do arquivo")}
            {v.status === "done" && [
              files.length > 1 ? `${files.length} partes` : null,
              v.grams !== null ? formatGrams(v.grams) : null,
              v.seconds !== null ? formatDuration(v.seconds) : null,
              v.measured ? formatSize(v.measured) : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        {v.cost && (
          <div className="flex gap-8 text-right">
            <div>
              <div className="text-xs text-ink-muted">Custo</div>
              <div className="text-ink-strong tabular-nums">{formatMoney(v.cost.total)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">{unit !== null ? "Vende por" : "Preço sugerido"}</div>
              <div className="text-2xl tracking-[-0.03em] text-ink-strong tabular-nums">{formatMoney(unit ?? v.cost.price)}</div>
            </div>
          </div>
        )}
        {canRemove && (
          <Dropdown
            trigger={(open, toggle) => (
              <Button variant="ghost" size="icon" aria-label="Mais ações da variação" aria-expanded={open} onClick={toggle}>
                <Icon icon={Ellipsis} />
              </Button>
            )}
          >
            {(close) => (
              <MenuItem className="text-danger" onClick={() => (close(), run("remove_library_variation", { variation: v.id }))}>
                <Icon icon={Trash2} /> Tirar esta variação
              </MenuItem>
            )}
          </Dropdown>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium text-ink-strong">{files.length > 1 ? `Partes para imprimir (${files.length})` : "Arquivo para imprimir"}</h3>
          {files.length > 1 && <p className="text-xs text-ink-muted">Cada parte tem seu 3MF e suas configurações. O custo acima soma todas.</p>}
        </div>
        {files.map((f, i) => {
          const where = usedIn(f.rel);
          return (
            <div key={f.rel} className="space-y-1.5">
              {(files.length > 1 || where.length > 0) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-ink-muted">
                  {files.length > 1 && <span className="font-medium text-ink-soft">Parte {i + 1}</span>}
                  {where.length > 0 && <span>Também em {where.join(", ")}</span>}
                  <button type="button" className="ml-auto underline-offset-2 hover:text-ink-strong hover:underline" onClick={() => update({ files: v.files.filter((r) => r !== f.rel) })}>
                    Tirar desta variação
                  </button>
                </div>
              )}
              <PrintFileCard slug={project.slug} file={f} isCover={isCover(f.rel)} piecesPerObject={project.pieces} onChanged={onChanged} />
            </div>
          );
        })}
        {files.length ? (
          <div className="flex flex-wrap gap-2">
            {uploadButton("Enviar outra parte")}
            {reuseMenu}
          </div>
        ) : (
          <div className="space-y-3">
            {base && (
              <Card tone="surface" className="flex flex-wrap items-center gap-3 p-4">
                <p className="min-w-0 flex-1 text-sm text-ink-soft">
                  Parte do que já existe em “{base.title}”? Comece pelos mesmos arquivos e envie só o que muda.
                </p>
                <Button size="sm" variant="secondary" onClick={() => addFiles(base.files)}>
                  <Icon icon={Copy} /> Usar os mesmos arquivos
                </Button>
              </Card>
            )}
            <Dropzone
              onFiles={(list) => upload(list, v.id)}
              busy={uploading}
              accept=".3mf,.stl"
              title="Arraste aqui o 3MF desta versão"
              hint="Pode ser mais de um: um por parte impressa separada · STL vai para os arquivos originais"
            />
            {reuseMenu}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink-strong">Preço de venda</h3>
        <SalePricesEditor tiers={v.salePrices} unitCost={v.cost?.total ?? null} suggested={v.cost?.price ?? null} onSave={(salePrices) => update({ salePrices })} />
        {v.colors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {v.colors.map((c) => (
              <span key={c.name} title={`Custo ${formatMoney(c.total)}`}><Badge>{c.name}: sugerido {formatMoney(c.price)}</Badge></span>
            ))}
          </div>
        )}
      </div>

      <Disclosure summary="Detalhes desta variação">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tamanho" hint="Para o anúncio. Ex.: 15 cm" optional>
              <Input value={size} onChange={(e) => setSize(e.target.value)} onBlur={() => size.trim() !== v.size && update({ size })} />
            </Field>
            <Field label="Característica" hint="O que muda além do tamanho. Ex.: Base redonda" optional>
              <Input value={feature} onChange={(e) => setFeature(e.target.value)} onBlur={() => feature.trim() !== v.feature && update({ feature })} />
            </Field>
          </div>
        </div>
      </Disclosure>
    </Card>
  );
}
