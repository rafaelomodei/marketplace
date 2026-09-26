"use client";

import {
  Box,
  ChevronDown,
  Download,
  FileUp,
  ImagePlus,
  Layers,
  LogOut,
  MousePointer2,
  Palette,
  Plus,
  Printer,
  Redo2,
  Scan,
  Sparkles,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Disclosure, Dropdown, FloatingPanel, Icon, IconTile, InlineEdit, MenuItem, Spinner, ToolButton, ToolDivider, Toolbar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { visibleParams, type StartFrom } from "@/lib/lab/params";
import { layerId, shapeAt } from "@/lib/lab/svg";
import type { LabCreation } from "@/lib/lab/creations";
import { groupBy, ModelStatus, PreviewToggles, PrintTips, ProblemAlert, SaveStatus, useEditorExit } from "../ModelParts";
import { ModelViewer, type ViewerHandle, type ViewerHit, type ViewerOutline } from "../ModelViewer";
import { ParamControl } from "../ParamControl";
import { useLabTool } from "../useLabTool";
import { ColorPointerIcon } from "./ColorPointerIcon";
import { ColorsPanel } from "./ColorsPanel";
import { DesignCanvas } from "./DesignCanvas";
import { importSvg } from "./importSvg";
import { LayersPanel } from "./LayersPanel";
import { SelectionBar } from "./SelectionBar";
import { useDesignEditor } from "./useDesignEditor";

type ViewMode = "3d" | "2d";
const COLORS = "Cores";

/**
 * Full-screen editor for Lab tools that start from a drawing (SVG). It covers the whole window, site header included
 * (inside the editor the Studio | Lab switcher is noise; "Sair do editor" goes back to the tool's history, or to the Lab): the piece in 3D with the drawing from above in the
 * corner (swap them with a click), tools on the left, the layers panel, dropdown panels for colors and settings, and a
 * bar to edit what you clicked — filament, color and relief height — right on the model.
 */
export function DesignWorkbench({
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
  const exit = useEditorExit(t, hasHistory);
  const e = useDesignEditor(t);
  const { tool, params, values } = t;
  const [main, setMain] = useState<ViewMode>("3d");
  const [panel, setPanel] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const view3d = t.viewer;
  const view2d = useRef<ViewerHandle>(null);
  const active = () => (main === "3d" ? view3d.current : view2d.current);

  // Settings panels: every section of the form except the drawing itself; fine adjustments go to the end of each one.
  const groups = groupBy(visibleParams(params, values).filter((p) => p.id !== e.param.id));
  const panels = [COLORS, ...groups.map(([g]) => g)];

  const border = Number(values.border ?? 0);
  const baseZ = Number(values.base_thickness ?? 0);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    const r = await importSvg(file);
    if ("error" in r) return setImportError(r.error);
    // Empty piece: the drawing goes into it. Otherwise it becomes a new piece; the current one stays in the history.
    if (t.empty) e.load(r.design);
    else await startNew({ [e.param.id]: r.design });
  };

  /** A new piece (the current one stays in the history): empty, or with the drawing just dropped. */
  const startNew = async (patch?: Record<string, string>) => {
    e.setSelection(null);
    setPanel(null);
    await t.startNew(patch);
  };

  // A click on the model: the base, or the shape under the pointer (the whole color with the color pointer).
  const pick3d = (hit: ViewerHit | null) => {
    if (!hit || t.parts.find((p) => p.id === hit.part)?.preview) return e.setSelection(null);
    if (hit.part === "base") return e.setSelection({ kind: "base" });
    const shape = e.layout ? shapeAt(e.layout, [hit.point[0], hit.point[1]]) : undefined;
    if (shape) return e.pick(shape);
    const layer = e.layers.find((l) => l.id === hit.part);
    if (layer) e.setSelection({ kind: "color", hex: layer.hex });
  };

  // The selected shapes, outlined on top of their relief.
  const outlines: ViewerOutline[] = (e.layout?.shapes ?? []).filter((s) => e.selectedSet.has(s.index)).map((s) => ({ rings: s.rings, z: baseZ + s.height }));

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]")) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        return ev.shiftKey ? t.history.redo() : t.history.undo();
      }
      if (mod && ev.key.toLowerCase() === "y") return (ev.preventDefault(), t.history.redo());
      if (mod) return;
      if (ev.key === "Escape") e.setSelection(null);
      else if (ev.key === "v" || ev.key === "V") e.setMode("shape");
      else if (ev.key === "c" || ev.key === "C") e.setMode("color");
      else if (ev.key === "t" || ev.key === "T") setMain((m) => (m === "3d" ? "2d" : "3d"));
      else if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && e.selection && e.selection.kind !== "base") {
        ev.preventDefault();
        const step = (ev.shiftKey ? 0.5 : 0.1) * (ev.key === "ArrowUp" ? 1 : -1);
        e.setHeight(Math.min(5, Math.max(0, Number((e.selectedHeight + step).toFixed(1)))));
      } else if ((ev.key === "Delete" || ev.key === "Backspace" || ev.key === "h" || ev.key === "H") && e.selection && e.selection.kind !== "base") e.setHidden(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const views = {
    "3d": (
      <ModelViewer
        handle={view3d}
        parts={t.viewerParts}
        onPick={main === "3d" ? pick3d : undefined}
        outlines={outlines}
        grid
        showFit={false}
        draggable={main === "3d" ? t.draggable : undefined}
        onDrag={t.dragPart}
        className="size-full bg-gradient-to-b from-canvas to-panel/70"
      />
    ),
    "2d": e.layout ? (
      <DesignCanvas
        handle={view2d}
        layout={e.layout}
        border={border}
        baseColor={t.colorOf("base").hex}
        fillOf={(s) => t.colorOf(layerId(s.color), s.color).hex}
        selected={e.selectedSet}
        onPick={(s) => e.pick(s)}
        guides={t.guides.filter((g) => !g.part || t.shownPreviews.includes(g.part))}
        guideColor={(part) => t.colorOf(part ?? "")?.hex}
        interactive={main === "2d"}
        onDrag={(part, delta, done) => t.draggable.includes(part) && t.dragPart(part, delta, done)}
        className="size-full"
      />
    ) : (
      <div className="grid size-full place-items-center bg-surface p-4 text-center text-sm text-ink-muted">{t.empty ? "Sem desenho ainda." : "Mostre pelo menos uma cor para ver o desenho."}</div>
    ),
  };
  const mini: ViewMode = main === "3d" ? "2d" : "3d";

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-canvas"
      onDragOver={(ev) => {
        ev.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(ev) => ev.currentTarget === ev.target && setDragging(false)}
      onDrop={(ev) => {
        ev.preventDefault();
        setDragging(false);
        load(ev.dataTransfer.files[0]);
      }}
    >
      <div className="relative size-full">
        {/* Both views stay mounted (the 3D keeps its camera); one fills the screen, the other is the corner preview. */}
        {(["3d", "2d"] as ViewMode[]).map((v) => (
          <div
            key={v}
            className={cn(
              "absolute overflow-hidden transition-[inset,width,height,border-radius] duration-300",
              v === main ? "inset-0 z-0" : "right-4 bottom-4 z-20 h-40 w-56 rounded-card shadow-lift ring-1 ring-black/5 sm:h-48 sm:w-64",
            )}
          >
            {views[v]}
            {v === mini && (
              <button
                type="button"
                onClick={() => setMain(v)}
                className="group absolute inset-0 flex items-end justify-start p-2"
                aria-label={v === "3d" ? "Ver em 3D" : "Ver de cima (2D)"}
                title="Trocar de vista (T)"
              >
                <span className="rounded-full bg-canvas/90 px-2.5 py-1 text-[11px] font-medium text-ink-strong shadow-float ring-1 ring-black/5 transition group-hover:bg-ink-strong group-hover:text-white">
                  {v === "3d" ? "3D" : "De cima"} · trocar
                </span>
              </button>
            )}
          </div>
        ))}

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-wrap items-start gap-2 p-3 sm:p-4">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full bg-canvas/85 py-1 pr-1.5 pl-1 shadow-float ring-1 ring-black/5 backdrop-blur-xl">
            <Link
              href={exit.href}
              onClick={exit.onClick}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-soft transition hover:bg-surface hover:text-ink-strong"
              title={`Sair do editor e voltar para ${exit.label}`}
            >
              <Icon icon={LogOut} className="size-3.5 -scale-x-100" /> Sair do editor
            </Link>
            <span className="h-4 w-px bg-line" />
            <span className="hidden truncate text-[13px] text-ink-muted md:inline">{tool.name} ·</span>
            <InlineEdit label="Nome da criação" value={t.saving.name} onChange={t.saving.rename} className="max-w-[40vw] text-[13px] font-medium sm:max-w-64" />
            <input ref={fileInput} type="file" accept=".svg,image/svg+xml" hidden onChange={(ev) => (load(ev.target.files?.[0]), (ev.target.value = ""))} />
            <button
              type="button"
              onClick={() => startNew()}
              title="Começar uma peça nova, vazia; esta continua salva em Minhas criações"
              className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-strong ring-1 ring-line-strong ring-inset hover:bg-surface"
            >
              <Icon icon={Plus} className="size-3.5" /> <span className="hidden sm:inline">Criar novo</span>
            </button>
          </div>

          <div className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-full bg-canvas/85 p-1 shadow-float ring-1 ring-black/5 backdrop-blur-xl">
              {panels.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-expanded={panel === p}
                  onClick={() => setPanel(panel === p ? null : p)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition",
                    panel === p ? "bg-ink-strong text-white" : "text-ink-soft hover:text-ink-strong",
                  )}
                >
                  {p === COLORS && <Icon icon={Palette} className="size-3.5" />}
                  {p}
                </button>
              ))}
            </div>
            <Dropdown
              trigger={(open, toggle) => (
                <Button variant="primary" size="md" aria-expanded={open} onClick={toggle} disabled={!t.downloads.ready}>
                  <Icon icon={Download} /> Baixar <Icon icon={ChevronDown} className="size-3.5" />
                </Button>
              )}
              className="w-80"
            >
              {(close) => (
                <div className="space-y-1">
                  {t.multicolor && (
                    <MenuItem onClick={() => (t.downloads.file3mf(), close())}>
                      <Icon icon={Download} />
                      <span className="flex-1">
                        <span className="block font-medium">3MF colorido</span>
                        <span className="block text-xs text-ink-muted">
                          {t.modelParts.length} peças, cada uma com sua cor — pronto para AMS
                        </span>
                      </span>
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => (t.downloads.zip(), close())}>
                    <Icon icon={Download} />
                    <span className="flex-1">
                      <span className="block font-medium">Todas as peças (.zip)</span>
                      <span className="block text-xs text-ink-muted">Um STL por peça</span>
                    </span>
                  </MenuItem>
                  <Disclosure className="px-3 py-2" summary="Um STL por vez">
                    <div className="-mt-2 space-y-0.5">
                      {t.files.map((f) => (
                        <MenuItem key={f.id} className="py-1.5 text-[13px]" onClick={() => (t.downloads.stl(f), close())}>
                          STL · {f.label}
                        </MenuItem>
                      ))}
                    </div>
                  </Disclosure>
                  {tool.printTips && (
                    <Disclosure className="border-t border-line px-3 pt-3 pb-2" summary={<span className="flex items-center gap-2"><Icon icon={Printer} /> Como imprimir</span>}>
                      <PrintTips tips={tool.printTips} />
                    </Disclosure>
                  )}
                </div>
              )}
            </Dropdown>
          </div>
        </div>

        {/* Settings panel (one at a time) */}
        {panel && (
          <div className="absolute top-16 right-3 bottom-56 z-30 flex w-[min(24rem,calc(100vw-1.5rem))] sm:top-[4.5rem] sm:right-4">
            <FloatingPanel title={panel} onClose={() => setPanel(null)} className="w-full">
              {panel === COLORS ? (
                <ColorsPanel t={t} e={e} />
              ) : (
                <div className="space-y-5">
                  {groups
                    .find(([g]) => g === panel)?.[1]
                    .map((p) => (
                      <ParamControl key={p.id} param={p} values={values} onChange={(id, v) => t.set(id, v, { merge: id })} />
                    ))}
                </div>
              )}
            </FloatingPanel>
          </div>
        )}

        {/* Tools + layers (left) */}
        <div className="absolute top-16 bottom-56 left-3 z-30 flex gap-3 sm:top-[4.5rem] sm:left-4">
          <div className="flex flex-col gap-2">
            <Toolbar label="Ferramentas">
              <ToolButton title="Selecionar uma forma" shortcut="V" active={e.mode === "shape"} onClick={() => e.setMode("shape")}>
                <Icon icon={MousePointer2} className="size-5" />
              </ToolButton>
              <ToolButton title="Selecionar tudo da mesma cor" shortcut="C" active={e.mode === "color"} onClick={() => e.setMode("color")}>
                <ColorPointerIcon />
              </ToolButton>
              <ToolDivider />
              <ToolButton title="Aproximar" onClick={() => active()?.zoom(0.8)}>
                <Icon icon={ZoomIn} className="size-5" />
              </ToolButton>
              <ToolButton title="Afastar" onClick={() => active()?.zoom(1.25)}>
                <Icon icon={ZoomOut} className="size-5" />
              </ToolButton>
              <ToolButton title="Centralizar" onClick={() => active()?.fit()}>
                <Icon icon={Scan} className="size-5" />
              </ToolButton>
              <ToolDivider />
              <ToolButton title="Desfazer" shortcut="Ctrl+Z" disabled={!t.history.canUndo} onClick={t.history.undo}>
                <Icon icon={Undo2} className="size-5" />
              </ToolButton>
              <ToolButton title="Refazer" shortcut="Ctrl+Shift+Z" disabled={!t.history.canRedo} onClick={t.history.redo}>
                <Icon icon={Redo2} className="size-5" />
              </ToolButton>
              <ToolDivider />
              <ToolButton title={main === "3d" ? "Ver de cima (2D)" : "Ver em 3D"} shortcut="T" onClick={() => setMain(main === "3d" ? "2d" : "3d")}>
                <Icon icon={main === "3d" ? Square : Box} className="size-5" />
              </ToolButton>
              <ToolButton title="Camadas" active={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
                <Icon icon={Layers} className="size-5" />
              </ToolButton>
            </Toolbar>
          </div>
          {layersOpen && e.design && (
            <div className="hidden min-h-0 items-start md:flex">
              <LayersPanel t={t} e={e} onClose={() => setLayersOpen(false)} />
            </div>
          )}
        </div>

        {/* Problems, top center */}
        <div className="pointer-events-none absolute inset-x-0 top-20 z-40 flex justify-center px-4 sm:top-24">
          <div className="pointer-events-auto w-full max-w-md space-y-2">
            {e.error && !t.empty ? <Alert tone="danger">{e.error}</Alert> : <ProblemAlert t={t} />}
            {t.error && !t.problem && <Alert tone="danger">Não foi possível gerar o modelo: {t.error}</Alert>}
            {importError && (
              <Alert tone="danger" onClose={() => setImportError(null)}>
                {importError}
              </Alert>
            )}
          </div>
        </div>

        {/* Bottom: status on the left, selection in the middle */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 p-3 pr-[15.5rem] sm:p-4 sm:pr-[18rem]">
          <div className="pointer-events-auto">
            <SelectionBar t={t} e={e} />
          </div>
          <div className="pointer-events-auto flex w-full flex-wrap items-center gap-2 self-start">
            <ModelStatus t={t} />
            <PreviewToggles t={t} />
            <SaveStatus t={t} className="rounded-full bg-canvas/85 px-2.5 py-1 shadow-float ring-1 ring-black/5 backdrop-blur-xl" />
            {!e.selection && (
              <span className="hidden text-xs text-ink-muted lg:inline">
                {e.mode === "color" ? "Clique numa cor do desenho para editar todas as formas dela." : "Clique numa forma para editar só ela."} Arraste para{" "}
                {main === "3d" ? "girar" : "mover"}, role para aproximar.{tool.drags?.filter((d) => d.hint && t.draggable.includes(d.part)).map((d) => ` ${d.hint}`)}
              </span>
            )}
          </div>
        </div>

        {/* Empty piece: add a drawing (button or drop), or try the sample. */}
        {t.empty && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-6">
            <div className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-panel border-2 border-dashed border-line-strong bg-canvas/90 px-6 py-10 text-center shadow-float backdrop-blur-xl">
              <IconTile icon={ImagePlus} tone="mint" size="lg" />
              <div className="space-y-1.5">
                <h2 className="text-lg tracking-[-0.02em] text-ink-strong">Adicione o seu desenho</h2>
                <p className="text-sm leading-relaxed text-ink-muted">Arraste um arquivo SVG para cá, ou escolha no computador.</p>
              </div>
              <Button variant="primary" size="lg" onClick={() => fileInput.current?.click()}>
                <Icon icon={FileUp} /> Adicionar desenho
              </Button>
              <Button variant="ghost" size="sm" onClick={() => e.load(String(e.param.default))}>
                <Icon icon={Sparkles} /> Usar o desenho de exemplo
              </Button>
            </div>
          </div>
        )}
        {!t.model && !t.problem && !t.error && main === "3d" && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-sm text-ink-muted">
            <span className="flex items-center gap-2">
              <Spinner /> Preparando o modelo 3D…
            </span>
          </div>
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-50 grid place-items-center rounded-panel border-2 border-dashed border-ink-strong bg-canvas/70 text-sm font-medium text-ink-strong backdrop-blur">
            {t.empty ? "Solte o SVG para usar este desenho" : "Solte o SVG para criar uma peça nova com ele"}
          </div>
        )}
      </div>
    </div>
  );
}
