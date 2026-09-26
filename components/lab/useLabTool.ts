"use client";

import { strToU8, zipSync } from "fflate";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { FilamentCatalog } from "@/lib/config";
import type { LabCreation } from "@/lib/lab/creations";
import { creationName } from "@/lib/lab/naming";
import { labJob, toolParts } from "@/lib/lab/job";
import { bounds, build3mf, buildStl, dimensions } from "@/lib/lab/mesh";
import { defaultValues, mainParam, startValues, type ParamValues, type StartFrom } from "@/lib/lab/params";
import { findTool } from "@/lib/lab/tools";
import type { ToolFile } from "@/lib/lab/types";
import { useScadRender } from "@/lib/lab/useScadRender";
import { filamentHex } from "@/lib/prompts";
import type { ViewerHandle } from "./ModelViewer";
import { nearestFilament, type PartColor } from "./PartColorField";
import { useCreationSave } from "./useCreationSave";

function download(data: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** What undo/redo restores: the values and the colors picked. */
type Snapshot = { values: ParamValues; colors: Record<string, PartColor> };
/** Changes with the same key in a row (a slider being dragged) become one undo step. */
export type ChangeOptions = { merge?: string };

/**
 * Everything a Lab tool page needs, whatever its layout (form + 3D, or the full-screen drawing editor): values with
 * undo/redo, colors per part (real filaments), the rendered model, sizes, files, downloads and the automatic save to
 * the tool's history (`creation`: the saved piece being reopened; none = a new one). The page passes `viewer` to its
 * 3D view (ModelViewer `handle`): it gives the thumbnail of the saved piece. A new piece starts from the tool's sample
 * or empty (`from`: the first piece of a tool shows the sample; the next ones start empty).
 */
export function useLabTool(toolId: string, creation?: LabCreation | null, from: StartFrom = "sample") {
  const tool = findTool(toolId)!;
  const params = tool.params ?? [];
  const [history, setHistory] = useState<{ past: Snapshot[]; present: Snapshot; future: Snapshot[] }>(() => ({
    past: [],
    present: { values: { ...startValues(params, creation ? "sample" : from), ...creation?.values }, colors: creation?.colors ?? {} },
    future: [],
  }));
  const lastChange = useRef<{ key: string; at: number } | null>(null);
  const { values, colors } = history.present;

  const commit = (next: (s: Snapshot) => Snapshot, opts: ChangeOptions = {}) =>
    setHistory((h) => {
      const now = Date.now();
      const merge = opts.merge && lastChange.current?.key === opts.merge && now - lastChange.current.at < 800;
      lastChange.current = opts.merge ? { key: opts.merge, at: now } : null;
      return { past: merge ? h.past : [...h.past.slice(-80), h.present], present: next(h.present), future: [] };
    });
  const undo = () =>
    setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h));
  const redo = () => setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));

  const set = (id: string, v: string | number, opts?: ChangeOptions) => commit((s) => ({ ...s, values: { ...s.values, [id]: v } }), opts);
  const setMany = (patch: ParamValues, opts?: ChangeOptions) => commit((s) => ({ ...s, values: { ...s.values, ...patch } }), opts);

  const [catalog, setCatalog] = useState<FilamentCatalog | null>(null);
  useEffect(() => {
    api<{ filaments: FilamentCatalog }>("/api/config")
      .then(({ filaments }) => setCatalog(filaments))
      .catch(() => setCatalog(null));
  }, []);

  // Some tools have one part per color of the uploaded drawing.
  const parts = useMemo(() => toolParts(tool, values), [tool, values]);
  const closest = (hex: string): PartColor => {
    const f = catalog ? nearestFilament(catalog, hex) : undefined;
    return f ? { filamentId: f.id, hex: filamentHex(f) } : { filamentId: null, hex };
  };
  /** Picked color, or the real filament closest to the part's suggested color. */
  const colorOf = (id: string, fallback = "#cccccc"): PartColor => {
    const part = parts.find((p) => p.id === id);
    if (part?.preview) return { filamentId: null, hex: part.defaultColor }; // not printed: keep its own look
    return colors[id] ?? closest(part?.defaultColor ?? fallback);
  };
  const setColor = (id: string, c: PartColor) => commit((s) => ({ ...s, colors: { ...s.colors, [id]: c } }));

  const [preset, setPreset] = useState(tool.presets?.[0]?.id ?? "");
  const applyPreset = (id: string) => {
    const pr = tool.presets?.find((x) => x.id === id);
    if (!pr) return;
    setPreset(id);
    commit(() => ({
      values: { ...defaultValues(params), ...pr.values },
      colors: Object.fromEntries(Object.entries(pr.colors ?? {}).map(([pid, hex]) => [pid, closest(hex)])),
    }));
  };

  // Nothing typed / no drawing yet: the screens invite to start instead of showing it as a problem.
  const main = mainParam(params);
  const empty = !!main && !String(values[main.id] ?? "").trim();
  const problem = tool.validate?.(values) ?? null;
  // Ways out of the problem (buttons next to it); searched only when there is one.
  const fixes = useMemo(() => (problem ? (tool.fixes?.(values) ?? []) : []), [problem, values, tool]);
  const render = useScadRender(tool, values, !problem);
  // An empty piece shows nothing (not the last model rendered, e.g. of the piece before "Nova criação").
  const model = empty ? null : render.model;
  const { busy, error } = render;

  const isPreview = (id: string) => !!parts.find((p) => p.id === id)?.preview;
  // Size of the printed piece (preview-only parts, like the virtual clip, don't count).
  const size = useMemo(() => {
    const b = model ? bounds(Object.entries(model.soups).filter(([id]) => !isPreview(id)).map(([, s]) => s)) : null;
    return b ? dimensions(b) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Parts that exist with the current values (colors to pick) and parts in the rendered model (files to download).
  const activeParts = parts.filter((p) => labJob(tool, values).parts.includes(p.id));
  const previewParts = parts.filter((p) => p.preview);
  const modelParts = parts.filter((p) => model?.stl[p.id] && !p.preview);
  const rendered = modelParts.map((p) => p.id);
  const files: ToolFile[] = (tool.files?.(values, rendered) ?? modelParts.map((p) => ({ id: p.id, label: p.label, parts: [p.id] }))).filter((f) =>
    f.parts.every((id) => rendered.includes(id)),
  );
  const multicolor = tool.multicolor?.(values) ?? true;
  const fileName = tool.fileName?.(values) ?? tool.id;

  // Pieces printed on their own (every file except the base); "Ver encaixes" lifts them above their pockets.
  const [exploded, setExploded] = useState(false);
  const pieces = multicolor ? [] : files.filter((f) => f.id !== "base").flatMap((f) => f.parts);
  const lift = exploded && pieces.length ? Math.max(10, (size?.[2] ?? 4) * 3) : 0;

  const [hiddenPreviews, setHiddenPreviews] = useState<string[]>([]);
  const togglePreview = (id: string) => setHiddenPreviews((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  const shownPreviews = previewParts.filter((p) => !hiddenPreviews.includes(p.id)).map((p) => p.id);

  // Dragging a part (e.g. the clip) changes its params right away; while OpenSCAD catches up, the part is shifted by
  // the difference between the values and the ones the model was made with, so it follows the pointer.
  const drags = tool.drags ?? [];
  const draggable = drags.map((d) => d.part).filter((id) => !hiddenPreviews.includes(id));
  const dragStart = useRef<ParamValues | null>(null);
  const dragPart = (part: string, [dx, dy]: [number, number], done: boolean) => {
    const d = drags.find((x) => x.part === part);
    if (!d) return;
    const start = (dragStart.current ??= values);
    const patch: ParamValues = {};
    for (const [id, delta] of [[d.x, dx], [d.y, dy]] as const) {
      const p = params.find((x) => x.id === id);
      if (p?.type !== "number") continue;
      const v = Math.round((Number(start[p.id]) + delta) / p.step) * p.step;
      patch[p.id] = +Math.min(p.max, Math.max(p.min, v)).toFixed(3);
    }
    setMany(patch, { merge: `drag-${part}` }); // the whole drag is one undo step
    if (done) {
      dragStart.current = null;
      lastChange.current = null;
    }
  };
  const renderedValues = useMemo(() => (model ? (JSON.parse(model.key) as ParamValues) : null), [model]);
  const shift = (id: string): [number, number] | undefined => {
    const d = drags.find((x) => x.part === id);
    if (!d || !renderedValues) return undefined;
    const by = (p?: string) => (p ? Number(values[p]) - Number(renderedValues[p]) : 0);
    return [by(d.x), by(d.y)];
  };

  const viewerParts = useMemo(
    () =>
      model
        ? Object.keys(model.soups)
            .filter((id) => !hiddenPreviews.includes(id))
            .map((id) => ({ id, soup: model.soups[id], color: colorOf(id).hex, lift: pieces.includes(id) ? lift : 0, offset: shift(id) }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, colors, catalog, parts, lift, pieces.join(), hiddenPreviews.join(), values],
  );

  const ready = !!model && !busy && !problem;

  const viewer = useRef<ViewerHandle>(null);
  // The picture is only taken when the 3D shows exactly the values being saved.
  const upToDate = ready && model.key === JSON.stringify(values);
  const saving = useCreationSave({
    toolId,
    creation,
    data: { values, colors },
    autoName: creationName(tool, values),
    ready: upToDate,
    snapshot: () => viewer.current?.snapshot?.() ?? null,
  });

  /**
   * Starts a new, empty piece; the one being edited stays saved in the history. `patch`: what it starts with (e.g. the
   * drawing just sent), saved right away; without it, it is saved on the first change.
   */
  const startNew = async (patch: ParamValues = {}) => {
    await saving.flush();
    const start: Snapshot = { values: { ...startValues(params, "blank"), ...patch }, colors: {} };
    saving.detach(start, Object.keys(patch).length === 0);
    lastChange.current = null;
    setHistory({ past: [], present: start, future: [] });
    setPreset(tool.presets?.[0]?.id ?? "");
    setExploded(false);
  };
  const fileData = (f: ToolFile) => (f.parts.length === 1 ? model!.stl[f.parts[0]] : buildStl(f.parts.map((id) => model!.soups[id])));
  const downloads = {
    ready,
    file3mf: () => {
      if (!model) return;
      const data = build3mf(modelParts.map((p) => ({ name: p.label, color: colorOf(p.id, p.defaultColor).hex, soup: model.soups[p.id] })));
      download(data, `${fileName}.3mf`, "model/3mf");
    },
    zip: () => {
      if (!model) return;
      const entries = Object.fromEntries(files.map((f) => [`${fileName}-${f.id}.stl`, fileData(f)]));
      entries["LEIA-ME.txt"] = strToU8(["Imprima cada arquivo na cor que quiser e encaixe as peças na base.", ...(tool.printTips ?? [])].join("\n"));
      download(zipSync(entries), `${fileName}.zip`, "application/zip");
    },
    stl: (f: ToolFile) => model && download(fileData(f), `${fileName}-${f.id}.stl`, "model/stl"),
  };

  return {
    tool,
    params,
    values,
    set,
    setMany,
    history: { undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 },
    catalog,
    parts,
    colorOf,
    setColor,
    closest,
    preset,
    applyPreset,
    problem,
    fixes,
    model,
    busy,
    error,
    size,
    activeParts,
    previewParts,
    modelParts,
    files,
    multicolor,
    pieces,
    exploded,
    setExploded,
    hiddenPreviews,
    togglePreview,
    shownPreviews,
    viewerParts,
    guides: tool.guides?.(values) ?? [],
    downloads,
    viewer,
    saving,
    startNew,
    main,
    empty,
    draggable,
    dragPart,
  };
}

export type LabToolState = ReturnType<typeof useLabTool>;
