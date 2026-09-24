"use client";

import { useState } from "react";
import { api, Button, Card, Spinner } from "@/components/ui";
import { alertError, Thumb, type TabProps } from "./shared";

const ZONES = [
  {
    kind: "real",
    title: "Fotos reais do produto",
    folder: "real/",
    hint: "Fotos do produto já impresso. É daqui que a IA copia forma, detalhes e textos — quanto mais ângulos, melhor.",
  },
  {
    kind: "style",
    title: "Referências de estilo / cenário",
    folder: "style-refs/",
    hint: "Fotos de inspiração: o cenário, luz e composição que você quer. O produto delas será substituído pelo seu.",
  },
] as const;

export function ReferencesTab({ product, reload, preview }: TabProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {ZONES.map((z) => (
          <UploadZone key={z.kind} {...z} product={product} reload={reload} preview={preview} />
        ))}
      </div>
      <MetaEditor product={product} reload={reload} />
    </div>
  );
}

function UploadZone({
  kind,
  title,
  folder,
  hint,
  product,
  reload,
  preview,
}: (typeof ZONES)[number] & Pick<TabProps, "product" | "reload" | "preview">) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const images = product.images.filter((i) => i.kind === kind);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const form = new FormData();
    form.set("kind", kind);
    for (const f of Array.from(files)) form.append("files", f);
    await api(`/api/products/${product.slug}/images`, { method: "POST", body: form }).catch(alertError);
    await reload();
    setUploading(false);
  }

  async function remove(id: number) {
    if (!confirm("Excluir esta imagem da pasta?")) return;
    await api(`/api/images/${id}`, { method: "DELETE" }).catch(alertError);
    await reload();
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 font-medium">
        {title} <code className="text-xs text-stone-400">{folder}</code>
      </h2>
      <p className="text-sm text-stone-500">{hint}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={`grid grid-cols-2 gap-3 rounded-lg border-2 border-dashed p-3 sm:grid-cols-3 xl:grid-cols-4 ${
          dragging ? "border-orange-400 bg-orange-50" : "border-stone-200"
        }`}
      >
        {images.map((img) => (
          <Thumb key={img.id} slug={product.slug} image={img} onClick={() => preview(img.rel)}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove(img.id);
              }}
              className="absolute top-1.5 right-1.5 hidden rounded bg-white/90 px-1.5 text-xs text-red-700 shadow group-hover:block"
            >
              excluir
            </button>
          </Thumb>
        ))}
        <label className="grid h-40 cursor-pointer place-items-center rounded-lg bg-stone-50 text-center text-sm text-stone-500 hover:bg-stone-100">
          {uploading ? (
            <Spinner />
          ) : (
            <span>
              <span className="block text-2xl">＋</span>arraste ou clique
            </span>
          )}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
    </section>
  );
}

function MetaEditor({ product, reload }: Pick<TabProps, "product" | "reload">) {
  const [meta, setMeta] = useState(product.meta);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(meta) !== JSON.stringify(product.meta);

  async function save() {
    setSaving(true);
    await api(`/api/products/${product.slug}`, { method: "PATCH", json: meta }).catch(alertError);
    await reload();
    setSaving(false);
  }

  const field = "w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm";
  return (
    <Card className="h-fit space-y-3 p-4">
      <h2 className="font-medium">Dados do produto</h2>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-600">Nome</span>
        <input className={field} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-600">Descrição</span>
        <textarea
          rows={3}
          className={field}
          value={meta.description}
          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-600">O que NUNCA pode mudar</span>
        <textarea
          rows={5}
          className={field}
          placeholder="Ex.: o nome 'Amália' e o número '1' devem aparecer exatamente assim"
          value={meta.fidelityNotes}
          onChange={(e) => setMeta({ ...meta, fidelityNotes: e.target.value })}
        />
        <span className="text-xs text-stone-400">Vai em todos os prompts, reforçando a fidelidade do produto.</span>
      </label>
      <Button variant="primary" disabled={!dirty || saving} onClick={save} className="w-full">
        {saving && <Spinner />} Salvar
      </Button>
    </Card>
  );
}
