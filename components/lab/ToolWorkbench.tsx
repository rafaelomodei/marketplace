"use client";

import { ArrowLeft, Box, Download, Info, Layers, Plus, Printer } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { Alert, Button, Card, ChoiceGroup, Container, Disclosure, Heading, Icon, InlineEdit, Lead, PaintedBackdrop, Spinner } from "@/components/ui";
import { defaultValues, visibleParams, type StartFrom } from "@/lib/lab/params";
import { LabFontFaces } from "./FontPicker";
import type { LabCreation } from "@/lib/lab/creations";
import { groupBy, ModelStatus, PreviewToggles, PrintTips, ProblemAlert, SaveStatus, useEditorExit } from "./ModelParts";
import { ModelViewer } from "./ModelViewer";
import { ParamControl } from "./ParamControl";
import { PartColorField } from "./PartColorField";
import { useLabTool } from "./useLabTool";

/** Generic page for a parametric Lab tool: the form comes from the tool's params, the model from its .scad. */
export function ToolWorkbench({
  toolId,
  creation,
  hasHistory = false,
  from,
}: {
  toolId: string;
  creation?: LabCreation | null;
  hasHistory?: boolean;
  from?: StartFrom;
}) {
  const t = useLabTool(toolId, creation, from);
  const { tool, params, values, model, problem, error, catalog } = t;
  const exit = useEditorExit(t, hasHistory);

  const shown = visibleParams(params, values);
  const basic = groupBy(shown.filter((p) => !p.advanced));
  const advanced = groupBy(shown.filter((p) => p.advanced));
  const colorsAfter = tool.colorsAfterGroup ?? basic[0]?.[0];
  const colorParts = t.activeParts.filter((p) => !p.preview);
  const onChange = (id: string, v: string | number) => t.set(id, v, { merge: id });

  return (
    <>
      <LabFontFaces />
      <section className="relative pt-24 pb-8">
        <PaintedBackdrop scene="sky" className="h-72 opacity-70" />
        <Container className="relative space-y-4">
          <Link href={exit.href} onClick={exit.onClick} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong">
            <Icon icon={ArrowLeft} /> {exit.label}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0 space-y-2">
              <Heading as="h1" size="title">
                {tool.name}
              </Heading>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <InlineEdit label="Nome da criação" value={t.saving.name} onChange={t.saving.rename} className="max-w-full text-lg tracking-[-0.02em]" />
                <SaveStatus t={t} />
              </div>
            </div>
            <Button onClick={() => t.startNew()} title="Começar outra peça; esta continua salva em Minhas criações">
              <Icon icon={Plus} /> Nova criação
            </Button>
          </div>
          <Lead className="max-w-2xl">{tool.tagline}</Lead>
        </Container>
      </section>

      <Container className="grid gap-8 pb-24 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <Card tone="surface" className="overflow-hidden">
            <ModelViewer handle={t.viewer} parts={t.viewerParts} draggable={t.draggable} onDrag={t.dragPart} className="aspect-[4/3] bg-gradient-to-b from-canvas to-panel/60">
              <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2">
                <ModelStatus t={t} />
              </div>
              {(t.pieces.length > 0 || t.previewParts.length > 0) && (
                <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-2">
                  {t.pieces.length > 0 && (
                    <Button size="sm" variant={t.exploded ? "primary" : "secondary"} onClick={() => t.setExploded(!t.exploded)}>
                      <Icon icon={Layers} /> {t.exploded ? "Ver montado" : "Ver encaixes"}
                    </Button>
                  )}
                  <PreviewToggles t={t} />
                </div>
              )}
              {t.empty && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted">
                  Preencha “{t.main?.label}” ao lado para ver a peça em 3D.
                </div>
              )}
              {!model && !problem && !error && (
                <div className="absolute inset-0 grid place-items-center text-sm text-ink-muted">
                  <span className="flex items-center gap-2">
                    <Spinner /> Preparando o modelo 3D…
                  </span>
                </div>
              )}
            </ModelViewer>
          </Card>
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Icon icon={Info} className="size-3.5" /> Arraste para girar · role para aproximar
          </p>

          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {t.multicolor ? (
                <Button variant="primary" size="lg" disabled={!t.downloads.ready} onClick={t.downloads.file3mf}>
                  <Icon icon={Download} /> Baixar 3MF ({t.modelParts.length} {t.modelParts.length === 1 ? "cor" : "cores"})
                </Button>
              ) : (
                <Button variant="primary" size="lg" disabled={!t.downloads.ready} onClick={t.downloads.zip}>
                  <Icon icon={Download} /> Baixar todas as peças (.zip)
                </Button>
              )}
              {t.files.map((f) => (
                <Button key={f.id} size="lg" disabled={!t.downloads.ready} onClick={() => t.downloads.stl(f)}>
                  STL · {f.label}
                </Button>
              ))}
            </div>
            {tool.printTips && (
              <Disclosure summary={<span className="flex items-center gap-2"><Icon icon={Printer} /> Como imprimir</span>}>
                <PrintTips tips={tool.printTips} />
              </Disclosure>
            )}
          </Card>
        </div>

        <aside className="space-y-8">
          <ProblemAlert t={t} />
          {error && !problem && <Alert tone="danger">Não foi possível gerar o modelo: {error}</Alert>}

          {tool.presets && tool.presets.length > 1 && (
            <section className="space-y-3">
              <h2 className="text-lg tracking-[-0.02em] text-ink-strong">Começar de um modelo</h2>
              <ChoiceGroup value={t.preset} onChange={t.applyPreset} options={tool.presets.map((p) => ({ value: p.id, label: p.label }))} />
            </section>
          )}

          {basic.map(([group, ps]) => (
            <Fragment key={group}>
              <section className="space-y-4">
                <h2 className="text-lg tracking-[-0.02em] text-ink-strong">{group}</h2>
                {ps.map((p) => (
                  <ParamControl key={p.id} param={p} values={values} onChange={onChange} />
                ))}
              </section>
              {/* Colors come right after the content (texts, icon): it is the next thing people decide. */}
              {group === colorsAfter && colorParts.length > 1 && (
                <section className="space-y-3">
                  <h2 className="text-lg tracking-[-0.02em] text-ink-strong">Cores</h2>
                  {catalog ? (
                    colorParts.map((p) => (
                      <PartColorField key={p.id} label={p.label} catalog={catalog} value={t.colorOf(p.id)} onChange={(c) => t.setColor(p.id, c)} />
                    ))
                  ) : (
                    <Spinner className="text-ink-faint" />
                  )}
                </section>
              )}
            </Fragment>
          ))}

          {advanced.length > 0 && (
            <Disclosure summary={<span className="flex items-center gap-2"><Icon icon={Box} /> Ajustes finos</span>} className="border-t border-line pt-6">
              <div className="space-y-8">
                {advanced.map(([group, ps]) => (
                  <section key={group} className="space-y-4">
                    <h3 className="text-sm font-medium text-ink-muted">{group}</h3>
                    {ps.map((p) => (
                      <ParamControl key={p.id} param={p} values={values} onChange={onChange} />
                    ))}
                  </section>
                ))}
                <Button variant="ghost" size="sm" onClick={() => t.setMany(defaultValues(params.filter((p) => p.advanced)))}>
                  Voltar ao padrão
                </Button>
              </div>
            </Disclosure>
          )}
        </aside>
      </Container>
    </>
  );
}
