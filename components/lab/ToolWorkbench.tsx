"use client";

import { ArrowLeft, Box, Download, Info, Layers, Printer } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, ChoiceGroup, Container, Disclosure, Heading, Icon, Lead, PaintedBackdrop, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { FilamentCatalog } from "@/lib/config";
import { strToU8, zipSync } from "fflate";
import { build3mf, bounds, buildStl, dimensions } from "@/lib/lab/mesh";
import { labJob } from "@/lib/lab/job";
import { defaultValues, visibleParams, type Param, type ParamValues } from "@/lib/lab/params";
import { findTool } from "@/lib/lab/tools";
import { useScadRender } from "@/lib/lab/useScadRender";
import { filamentHex } from "@/lib/prompts";
import { LabFontFaces } from "./FontPicker";
import { ModelViewer } from "./ModelViewer";
import { ParamControl } from "./ParamControl";
import { nearestFilament, PartColorField, type PartColor } from "./PartColorField";

const mm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function download(data: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Groups params by section, keeping the order in which sections first appear. */
function groupBy(params: Param[]) {
  const groups = new Map<string, Param[]>();
  for (const p of params) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return [...groups];
}

/** Generic page for a parametric Lab tool: the form comes from the tool's params, the model from its .scad. */
export function ToolWorkbench({ toolId }: { toolId: string }) {
  const tool = findTool(toolId)!;
  const params = tool.params ?? [];
  const parts = tool.parts ?? [];
  const [values, setValues] = useState<ParamValues>(() => defaultValues(params));
  const [preset, setPreset] = useState(tool.presets?.[0]?.id ?? "");
  const [exploded, setExploded] = useState(false);
  const [catalog, setCatalog] = useState<FilamentCatalog | null>(null);
  const [colors, setColors] = useState<Record<string, PartColor>>(() =>
    Object.fromEntries(parts.map((p) => [p.id, { filamentId: null, hex: p.defaultColor }])),
  );

  // Default colors: the real filament closest to each part's suggested color.
  useEffect(() => {
    api<{ filaments: FilamentCatalog }>("/api/config")
      .then(({ filaments }) => {
        setCatalog(filaments);
        setColors((c) =>
          Object.fromEntries(
            parts.map((p) => {
              const f = nearestFilament(filaments, p.defaultColor);
              return [p.id, c[p.id]?.filamentId || !f ? c[p.id] : { filamentId: f.id, hex: filamentHex(f) }];
            }),
          ),
        );
      })
      .catch(() => setCatalog(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problem = tool.validate?.(values) ?? null;
  const { model, busy, error } = useScadRender(tool, values, !problem);
  const size = useMemo(() => {
    const b = model ? bounds(Object.values(model.soups)) : null;
    return b ? dimensions(b) : null;
  }, [model]);

  const set = (id: string, v: string | number) => setValues((prev) => ({ ...prev, [id]: v }));
  const shown = visibleParams(params, values);
  const basic = groupBy(shown.filter((p) => !p.advanced));
  const advanced = groupBy(shown.filter((p) => p.advanced));
  const colorsAfter = tool.colorsAfterGroup ?? basic[0]?.[0];
  const fileName = tool.fileName?.(values) ?? tool.id;
  // Parts that exist with the current values (colors to pick) and parts in the rendered model (files to download).
  const activeParts = parts.filter((p) => labJob(tool, values).parts.includes(p.id));
  const modelParts = parts.filter((p) => model?.stl[p.id]);
  const rendered = modelParts.map((p) => p.id);
  const files = (tool.files?.(values, rendered) ?? modelParts.map((p) => ({ id: p.id, label: p.label, parts: [p.id] }))).filter((f) =>
    f.parts.every((id) => rendered.includes(id)),
  );
  const multicolor = tool.multicolor?.(values) ?? true;
  // Pieces printed on their own (every file except the base); "Ver encaixes" lifts them above their pockets.
  const pieces = multicolor ? [] : files.filter((f) => f.id !== "base").flatMap((f) => f.parts);
  const lift = exploded && pieces.length ? Math.max(10, (size?.[2] ?? 4) * 3) : 0;
  const viewerParts = useMemo(
    () =>
      model
        ? parts
            .filter((p) => model.soups[p.id])
            .map((p) => ({ id: p.id, soup: model.soups[p.id], color: colors[p.id]?.hex ?? p.defaultColor, lift: pieces.includes(p.id) ? lift : 0 }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, colors, parts, lift, pieces.join()],
  );
  const fileData = (f: (typeof files)[number]) =>
    f.parts.length === 1 ? model!.stl[f.parts[0]] : buildStl(f.parts.map((id) => model!.soups[id]));

  const applyPreset = (id: string) => {
    const pr = tool.presets?.find((x) => x.id === id);
    if (!pr) return;
    setPreset(id);
    setValues({ ...defaultValues(params), ...pr.values });
    setColors((c) => {
      const next = { ...c };
      for (const p of parts) {
        const hex = pr.colors?.[p.id] ?? p.defaultColor;
        const f = catalog ? nearestFilament(catalog, hex) : undefined;
        next[p.id] = f ? { filamentId: f.id, hex: filamentHex(f) } : { filamentId: null, hex };
      }
      return next;
    });
  };

  const download3mf = () => {
    if (!model) return;
    const data = build3mf(modelParts.map((p) => ({ name: p.label, color: colors[p.id]?.hex ?? p.defaultColor, soup: model.soups[p.id] })));
    download(data, `${fileName}.3mf`, "model/3mf");
  };

  const downloadZip = () => {
    if (!model) return;
    const entries = Object.fromEntries(files.map((f) => [`${fileName}-${f.id}.stl`, fileData(f)]));
    entries["LEIA-ME.txt"] = strToU8(["Imprima cada arquivo na cor que quiser e encaixe as peças na base.", ...(tool.printTips ?? [])].join("\n"));
    download(zipSync(entries), `${fileName}.zip`, "application/zip");
  };

  return (
    <>
      <LabFontFaces />
      <section className="relative pt-24 pb-8">
        <PaintedBackdrop scene="sky" className="h-72 opacity-70" />
        <Container className="relative space-y-4">
          <Link href="/lab" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong">
            <Icon icon={ArrowLeft} /> Lab
          </Link>
          <Heading as="h1" size="title">
            {tool.name}
          </Heading>
          <Lead className="max-w-2xl">{tool.tagline}</Lead>
        </Container>
      </section>

      <Container className="grid gap-8 pb-24 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <Card tone="surface" className="overflow-hidden">
            <ModelViewer parts={viewerParts} className="aspect-[4/3] bg-gradient-to-b from-canvas to-panel/60">
              <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2">
                {busy ? (
                  <Badge tone="warning" dot>
                    Gerando 3D…
                  </Badge>
                ) : model ? (
                  <Badge tone="accent" dot>
                    Pronto
                  </Badge>
                ) : null}
                {size && (
                  <Badge>
                    {mm(size[0])} × {mm(size[1])} × {mm(size[2])} mm
                  </Badge>
                )}
              </div>
              {pieces.length > 0 && (
                <div className="absolute top-3 right-3">
                  <Button size="sm" variant={exploded ? "primary" : "secondary"} onClick={() => setExploded(!exploded)}>
                    <Icon icon={Layers} /> {exploded ? "Ver montado" : "Ver encaixes"}
                  </Button>
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
              {multicolor ? (
                <Button variant="primary" size="lg" disabled={!model || busy || !!problem} onClick={download3mf}>
                  <Icon icon={Download} /> Baixar 3MF ({modelParts.length} {modelParts.length === 1 ? "cor" : "cores"})
                </Button>
              ) : (
                <Button variant="primary" size="lg" disabled={!model || busy || !!problem} onClick={downloadZip}>
                  <Icon icon={Download} /> Baixar todas as peças (.zip)
                </Button>
              )}
              {files.map((f) => (
                <Button
                  key={f.id}
                  size="lg"
                  disabled={!model || busy || !!problem}
                  onClick={() => model && download(fileData(f), `${fileName}-${f.id}.stl`, "model/stl")}
                >
                  STL · {f.label}
                </Button>
              ))}
            </div>
            {tool.printTips && (
              <Disclosure summary={<span className="flex items-center gap-2"><Icon icon={Printer} /> Como imprimir</span>}>
                <ul className="space-y-1.5 text-sm text-ink-muted">
                  {tool.printTips.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" />
                      {t}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </Card>
        </div>

        <aside className="space-y-8">
          {problem && <Alert tone="danger">{problem}</Alert>}
          {error && !problem && <Alert tone="danger">Não foi possível gerar o modelo: {error}</Alert>}

          {tool.presets && tool.presets.length > 1 && (
            <section className="space-y-3">
              <h2 className="text-lg tracking-[-0.02em] text-ink-strong">Começar de um modelo</h2>
              <ChoiceGroup value={preset} onChange={applyPreset} options={tool.presets.map((p) => ({ value: p.id, label: p.label }))} />
            </section>
          )}

          {basic.map(([group, ps]) => (
            <Fragment key={group}>
              <section className="space-y-4">
                <h2 className="text-lg tracking-[-0.02em] text-ink-strong">{group}</h2>
                {ps.map((p) => (
                  <ParamControl key={p.id} param={p} values={values} onChange={set} />
                ))}
              </section>
              {/* Colors come right after the content (texts, icon): it is the next thing people decide. */}
              {group === colorsAfter && parts.length > 1 && (
                <section className="space-y-3">
                  <h2 className="text-lg tracking-[-0.02em] text-ink-strong">Cores</h2>
                  {catalog ? (
                    activeParts.map((p) => (
                      <PartColorField key={p.id} label={p.label} catalog={catalog} value={colors[p.id]} onChange={(c) => setColors({ ...colors, [p.id]: c })} />
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
                      <ParamControl key={p.id} param={p} values={values} onChange={set} />
                    ))}
                  </section>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setValues({ ...values, ...defaultValues(params.filter((p) => p.advanced)) })}>
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
