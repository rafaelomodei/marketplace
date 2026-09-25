"use client";

import { Download, Frame, MousePointerClick, Undo2 } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, ChoiceGroup, Code, Disclosure, EmptyState, Field, Icon, ImageTile, SectionHeader, Spinner } from "@/components/ui";
import { api, fileUrl, reportError } from "@/lib/client/api";
import type { StepProps } from "./shared";

type Fit = "auto" | "pad" | "crop";
const FITS: { value: Fit; label: string; hint: string }[] = [
  { value: "auto", label: "Automático", hint: "Bordas brancas: completa com branco. Cenário: recorte inteligente." },
  { value: "pad", label: "Completar com branco", hint: "Mostra a imagem inteira." },
  { value: "crop", label: "Recortar", hint: "Preenche o quadro, cortando as bordas." },
];

export function PublishStep({ product, config, reload, preview, goTo }: StepProps) {
  const approved = product.images.filter((i) => i.kind === "approved");
  const exports = product.images.filter((i) => i.kind === "export");
  const mpIds = Object.keys(config.marketplaces);

  const [marketplace, setMarketplace] = useState(product.meta.marketplaces[0] ?? mpIds[0]);
  const targets = config.marketplaces[marketplace]?.targets ?? [];
  const [targetIds, setTargetIds] = useState<string[]>(() => targets.map((t) => t.id));
  const [fit, setFit] = useState<Fit>("auto");
  const [selected, setSelected] = useState<number[]>(() => approved.map((i) => i.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    await fn().catch(reportError);
    await reload();
    setBusy(null);
  }

  const exportSelected = () =>
    run("export", async () => {
      const { created } = await api<{ created: number[] }>(`/api/products/${product.slug}/export`, {
        method: "POST",
        json: { imageIds: selected, marketplace, targetIds, mode: fit === "auto" ? undefined : fit },
      });
      setDone(created.length);
    });

  if (!approved.length)
    return (
      <EmptyState
        icon={MousePointerClick}
        tone="mint"
        title="Nenhuma imagem aprovada ainda"
        description="Aprove as imagens que ficaram boas e elas aparecem aqui, prontas para virar arquivos do anúncio."
        action={
          <Button variant="primary" onClick={() => goTo("review")}>
            Escolher imagens
          </Button>
        }
      />
    );

  const fileCount = selected.length * targetIds.length;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <section className="space-y-6">
        <SectionHeader size="heading" title="Imagens aprovadas" description="Marque as que vão para o anúncio. Todas já vêm marcadas." />
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
          {approved.map((img) => {
            const isSelected = selected.includes(img.id);
            const own = exports.filter((e) => e.parent_id === img.id);
            return (
              <article key={img.id} className="space-y-3">
                <ImageTile
                  src={fileUrl(product.slug, img.rel, 700)}
                  selected={isSelected}
                  onSelect={() => setSelected(isSelected ? selected.filter((x) => x !== img.id) : [...selected, img.id])}
                  onZoom={() => preview(img.rel)}
                />
                {own.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {own.map((e) => (
                      <button key={e.id} type="button" onClick={() => preview(e.rel)} className="space-y-1 text-left">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileUrl(product.slug, e.rel, 160)} alt="" className="h-16 rounded-lg bg-surface ring-1 ring-line" />
                        <Badge tone="success">{e.label}</Badge>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === `reframe-${img.id}`}
                    title="Estende o cenário com IA em vez de cortar (gera uma nova imagem para aprovar)"
                    onClick={() => run(`reframe-${img.id}`, () => api(`/api/images/${img.id}`, { method: "POST", json: { action: "reframe", aspect: "3:4" } }))}
                  >
                    <Icon icon={Frame} /> Estender para 3:4 com IA
                  </Button>
                  {img.parent_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === `unapprove-${img.id}`}
                      onClick={() => run(`unapprove-${img.id}`, () => api(`/api/images/${img.parent_id}`, { method: "POST", json: { action: "reset" } }))}
                    >
                      <Icon icon={Undo2} /> Remover aprovação
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="lg:sticky lg:top-20 lg:h-fit">
        <Card className="space-y-6 p-5">
          <Field as="div" label="Onde você vai anunciar?">
            <ChoiceGroup
              value={marketplace}
              onChange={(id) => {
                setMarketplace(id);
                setTargetIds(config.marketplaces[id].targets.map((t) => t.id));
              }}
              options={mpIds.map((id) => ({ value: id, label: config.marketplaces[id].name }))}
            />
          </Field>
          <Field as="div" label="Tamanhos" hint="Já vêm marcados os tamanhos que o marketplace pede.">
            <ChoiceGroup multiple value={targetIds} onChange={setTargetIds} options={targets.map((t) => ({ value: t.id, label: t.label }))} />
          </Field>
          <Disclosure summary="Como ajustar ao tamanho">
            <Field as="div" label="Ajuste" hint={FITS.find((f) => f.value === fit)?.hint}>
              <ChoiceGroup value={fit} onChange={setFit} options={FITS} />
            </Field>
          </Disclosure>
          <Button variant="primary" size="lg" className="w-full" disabled={!fileCount || busy === "export"} onClick={exportSelected}>
            {busy === "export" ? <Spinner /> : <Icon icon={Download} />} Preparar {fileCount} {fileCount === 1 ? "arquivo" : "arquivos"}
          </Button>
          {done !== null && (
            <Alert tone="success" onClose={() => setDone(null)}>
              {done} {done === 1 ? "arquivo pronto" : "arquivos prontos"} em <Code className="text-success">exports/{marketplace}/</Code>
            </Alert>
          )}
        </Card>
      </aside>
    </div>
  );
}
