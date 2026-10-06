"use client";

import { ArrowRight, Lightbulb } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Dropzone, Field, Icon, ImageTile, Input, SectionHeader, Spinner, Textarea } from "@/components/ui";
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
  const hasPhotos = product.images.some((i) => i.kind === "real");
  const saveMeta = useRef<() => Promise<void>>(async () => {});
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-14">
        {ZONES.map((z) => (
          <UploadZone key={z.kind} zone={z} product={product} reload={reload} preview={preview} optional={z.kind === "style"} />
        ))}
        {hasPhotos && (
          <div className="flex justify-end border-t border-line pt-6">
            <Button
              variant="primary"
              onClick={async () => {
                await saveMeta.current();
                goTo("create");
              }}
            >
              Continuar para criar <Icon icon={ArrowRight} />
            </Button>
          </div>
        )}
      </div>
      <aside className="space-y-4">
        <MetaEditor product={product} reload={reload} onSaveReady={(save) => (saveMeta.current = save)} />
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

function MetaEditor({ product, reload, onSaveReady }: Pick<StepProps, "product" | "reload"> & { onSaveReady: (save: () => Promise<void>) => void }) {
  const [meta, setMeta] = useState(product.meta);
  const [saving, setSaving] = useState(false);
  const metaRef = useRef(meta);
  const savedRef = useRef(JSON.stringify(product.meta));
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const dirty = JSON.stringify(meta) !== savedRef.current;

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  // A reload after a save updates the server baseline without throwing away a newer local edit.
  useEffect(() => {
    if (JSON.stringify(metaRef.current) === savedRef.current) {
      savedRef.current = JSON.stringify(product.meta);
      setMeta(product.meta);
    }
  }, [product.meta]);

  async function save() {
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      while (JSON.stringify(metaRef.current) !== savedRef.current) {
        const snapshot = metaRef.current;
        if (mounted.current) setSaving(true);
        try {
          await api(`/api/products/${product.slug}`, { method: "PATCH", json: snapshot });
          savedRef.current = JSON.stringify(snapshot);
          await reload();
        } catch (error) {
          reportError(error);
          return;
        } finally {
          if (mounted.current) setSaving(false);
        }
      }
    };
    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }

  // Save after a short pause, rather than on every keystroke. The same flush is used by Continue.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [meta, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mounted.current = true;
    onSaveReady(save);
    const saveBeforeLeaving = () => void save();
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", saveBeforeLeaving);
      // Covers changing step through the top navigation as well as a browser navigation.
      void save();
    };
  }, []); // The function intentionally reads refs, so this is registered once.

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
        {saving && <Spinner />} {dirty ? "Salvar agora" : "Salvo automaticamente"}
      </Button>
    </Card>
  );
}
