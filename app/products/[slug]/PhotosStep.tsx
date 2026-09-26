"use client";

import { ArrowRight, Box, Lightbulb, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink, Card, Dropzone, Field, Icon, ImageTile, Input, SectionHeader, Spinner, Textarea } from "@/components/ui";
import { api, fileUrl, reportError } from "@/lib/client/api";
import type { StepProps } from "./shared";

const ZONES = [
  {
    kind: "real",
    title: "Fotos do produto",
    description: "Fotos do produto já impresso. É daqui que a IA copia forma, detalhes e textos — quanto mais ângulos, melhor.",
    empty: "Arraste as fotos do produto aqui",
  },
  {
    kind: "style",
    title: "Cenários",
    description: "Fotos de ambiente onde você quer ver o seu produto (uma mesa posta, um bolo, uma estante). A cena fica igual; só o objeto é trocado.",
    empty: "Arraste fotos de cenário aqui",
  },
] as const;

const TIPS = ["Luz natural, sem flash", "2 a 4 ângulos diferentes", "Produto inteiro no quadro", "Fundo simples ajuda, mas não é obrigatório"];

export function PhotosStep({ product, reload, preview, goTo }: StepProps) {
  const hasPhotos = product.images.some((i) => i.kind === "real" || i.kind === "render");
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-14">
        <LabRenders product={product} reload={reload} preview={preview} />
        {ZONES.map((z) => (
          <UploadZone key={z.kind} zone={z} product={product} reload={reload} preview={preview} optional={z.kind === "style"} />
        ))}
        {hasPhotos && (
          <div className="flex justify-end border-t border-line pt-6">
            <Button variant="primary" onClick={() => goTo("create")}>
              Continuar para criar <Icon icon={ArrowRight} />
            </Button>
          </div>
        )}
      </div>
      <aside className="space-y-4">
        <MetaEditor product={product} reload={reload} />
        <Card tone="surface" className="space-y-3 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-strong">
            <Icon icon={Lightbulb} /> Dicas para boas fotos
          </p>
          <ul className="space-y-1.5 text-sm text-ink-muted">
            {TIPS.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

/** Products made in the Lab: the pictures of the 3D model (references for the AI, never in the ad) and a way back. */
function LabRenders({ product, reload, preview }: Pick<StepProps, "product" | "reload" | "preview">) {
  const [refreshing, setRefreshing] = useState(false);
  const renders = product.images.filter((i) => i.kind === "render");
  const lab = product.meta.lab;
  if (!lab || !renders.length) return null;

  async function refresh() {
    setRefreshing(true);
    await api(`/api/lab/creations/${lab!.creation}/studio`, { method: "POST" }).catch(reportError);
    await reload();
    setRefreshing(false);
  }

  return (
    <section className="space-y-5">
      <SectionHeader
        size="heading"
        eyebrow={`Do Lab · ${lab.toolName}`}
        title="Modelo 3D"
        description="Imagens do modelo que você criou no Lab. A IA usa para criar fotos da peça como se já estivesse impressa — elas não vão para o anúncio."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {renders.map((img) => (
          <ImageTile key={img.id} src={fileUrl(product.slug, img.rel, 400)} onZoom={() => preview(img.rel)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/lab/${lab.tool}/${lab.creation}`} size="sm">
          <Icon icon={Box} /> Abrir no Lab
        </ButtonLink>
        <Button size="sm" variant="ghost" disabled={refreshing} onClick={refresh} title="Mudou a peça no Lab? Refaz as imagens do 3D com a versão atual.">
          {refreshing ? <Spinner /> : <Icon icon={RefreshCw} />} Atualizar imagens do 3D
        </Button>
      </div>
    </section>
  );
}

function UploadZone({
  zone,
  product,
  reload,
  preview,
  optional,
}: { zone: (typeof ZONES)[number]; optional?: boolean } & Pick<StepProps, "product" | "reload" | "preview">) {
  const [uploading, setUploading] = useState(false);
  const images = product.images.filter((i) => i.kind === zone.kind);

  async function upload(files: File[]) {
    setUploading(true);
    const form = new FormData();
    form.set("kind", zone.kind);
    for (const f of files) form.append("files", f);
    await api(`/api/products/${product.slug}/images`, { method: "POST", body: form }).catch(reportError);
    await reload();
    setUploading(false);
  }

  async function remove(id: number) {
    if (!confirm("Excluir esta imagem da pasta?")) return;
    await api(`/api/images/${id}`, { method: "DELETE" }).catch(reportError);
    await reload();
  }

  return (
    <section className="space-y-5">
      <SectionHeader size="heading" eyebrow={optional ? "Opcional" : undefined} title={zone.title} description={zone.description} />
      {images.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {images.map((img) => (
            <ImageTile key={img.id} src={fileUrl(product.slug, img.rel, 400)} onZoom={() => preview(img.rel)} onRemove={() => remove(img.id)} />
          ))}
          <Dropzone compact busy={uploading} onFiles={upload} />
        </div>
      ) : (
        <Dropzone busy={uploading} onFiles={upload} title={zone.empty} />
      )}
    </section>
  );
}

function MetaEditor({ product, reload }: Pick<StepProps, "product" | "reload">) {
  const [meta, setMeta] = useState(product.meta);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(meta) !== JSON.stringify(product.meta);

  async function save() {
    setSaving(true);
    await api(`/api/products/${product.slug}`, { method: "PATCH", json: meta }).catch(reportError);
    await reload();
    setSaving(false);
  }

  return (
    <Card className="space-y-5 p-5">
      <p className="font-medium tracking-[-0.01em] text-ink-strong">Sobre o produto</p>
      <Field label="Nome">
        <Input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
      </Field>
      <Field label="O que a IA nunca pode mudar" hint="Vai em todos os pedidos para a IA, reforçando a fidelidade do produto.">
        <Textarea
          rows={4}
          placeholder="Ex.: o nome 'Amália' e o número '1' devem aparecer exatamente assim"
          value={meta.fidelityNotes}
          onChange={(e) => setMeta({ ...meta, fidelityNotes: e.target.value })}
        />
      </Field>
      <Field label="Descrição" optional>
        <Textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
      </Field>
      <Button variant="primary" disabled={!dirty || saving} onClick={save} className="w-full">
        {saving && <Spinner />} {dirty ? "Salvar" : "Salvo"}
      </Button>
    </Card>
  );
}
