"use client";

import { useMemo, useState } from "react";
import {
  adjustLayer,
  adjustShapes,
  artOf,
  designLayers,
  designShapes,
  layerId,
  layoutDesign,
  readDesign,
  writeDesign,
  type DesignShape,
  type SvgDesign,
  type SvgLayer,
  type SvgLayout,
} from "@/lib/lab/svg";
import type { PartColor } from "../PartColorField";
import type { LabToolState } from "../useLabTool";

/** "shape": one shape per click; "color": every shape of the clicked color. */
export type PickMode = "shape" | "color";
/** What is selected: the base, a whole color, or some shapes. */
export type Selection = { kind: "base" } | { kind: "color"; hex: string } | { kind: "shapes"; indexes: number[] };

/**
 * The drawing being edited and every action of the editor (select, recolor, change heights, hide), as changes to the
 * design param — so they go through undo/redo and the 3D model like any other value.
 */
export function useDesignEditor(t: LabToolState) {
  const param = t.params.find((p) => p.type === "svg")!;
  const value = String(t.values[param.id]);
  const width = Number(t.values.width);
  const [mode, setMode] = useState<PickMode>("color");
  const [selection, setSelection] = useState<Selection | null>(null);

  const state = useMemo(() => {
    const design = readDesign(value);
    if (!design) return { error: "Envie um desenho em SVG." };
    try {
      const art = artOf(design.svg);
      const shapes = designShapes(art, design);
      const layers = designLayers(art, design);
      let layout: SvgLayout | null = null;
      try {
        layout = layoutDesign(design, width);
      } catch {
        layout = null;
      }
      return { design, art, shapes, layers, layout, error: null };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [value, width]);

  const ok = state.error === null ? state : null;
  const save = (d: SvgDesign, merge?: string) => t.set(param.id, writeDesign(d), merge ? { merge } : undefined);
  const layerOf = (hex: string) => ok?.layers.find((l) => l.hex === hex);
  const shapesOf = (hex: string) => ok?.shapes.filter((s) => s.color === hex) ?? [];

  /** Shapes in the selection (visible or not). */
  const selectedShapes: DesignShape[] = !ok || !selection || selection.kind === "base"
    ? []
    : selection.kind === "color"
      ? shapesOf(selection.hex)
      : ok.shapes.filter((s) => selection.indexes.includes(s.index));
  const selectedSet = new Set(selectedShapes.filter((s) => !s.hidden).map((s) => s.index));

  const pick = (shape: DesignShape | null, additive = false) => {
    if (!shape) return setSelection(null);
    if (mode === "color") return setSelection({ kind: "color", hex: shape.color });
    const current = selection?.kind === "shapes" ? selection.indexes : [];
    if (!additive) return setSelection({ kind: "shapes", indexes: [shape.index] });
    const next = current.includes(shape.index) ? current.filter((i) => i !== shape.index) : [...current, shape.index];
    setSelection(next.length ? { kind: "shapes", indexes: next } : null);
  };

  /** Height shown for the selection: the color's, or the first selected shape's. */
  const selectedHeight =
    selection?.kind === "color" ? (layerOf(selection.hex)?.height ?? 0) : selection?.kind === "shapes" ? (selectedShapes[0]?.height ?? 0) : 0;

  const setHeight = (h: number) => {
    if (!ok || !selection || selection.kind === "base") return;
    if (selection.kind === "color") {
      // The whole color, including shapes that had their own height.
      const own = shapesOf(selection.hex).map((s) => s.index);
      save(adjustShapes(adjustLayer(ok.art, ok.design, selection.hex, { height: h }), own, { height: null }), `h-${selection.hex}`);
    } else save(adjustShapes(ok.design, selection.indexes, { height: h }), `h-${selection.indexes.join()}`);
  };

  /** Moves the selection to another color (joins that color's filament and height). */
  const recolor = (hex: string) => {
    if (!ok || !selection || selection.kind === "base") return;
    const list = selection.kind === "color" ? shapesOf(selection.hex) : selectedShapes;
    // Back to its own color: just drop the adjustment.
    let d = ok.design;
    for (const s of list) d = adjustShapes(d, [s.index], { color: s.source === hex ? null : hex, height: null });
    save(d);
    setSelection(selection.kind === "color" ? { kind: "color", hex } : selection);
  };

  /** A new color from a filament: the selection moves to it and it prints with that filament. */
  const recolorNew = (c: PartColor) => {
    t.setColor(layerId(c.hex), c);
    recolor(c.hex);
  };

  const setHidden = (hidden: boolean, target: Selection | null = selection) => {
    if (!ok || !target || target.kind === "base") return;
    if (target.kind === "color") save(adjustLayer(ok.art, ok.design, target.hex, { hidden }));
    else save(adjustShapes(ok.design, target.indexes, { hidden: hidden || null }));
    if (hidden) setSelection(null);
  };

  /** Shows the shapes of a color that were hidden one by one. */
  const showShapes = (hex: string) => ok && save(adjustShapes(ok.design, shapesOf(hex).filter((s) => ok.design.shapes?.[s.index]?.hidden).map((s) => s.index), { hidden: null }));

  const resetShapes = () =>
    ok && selectedShapes.length && save(adjustShapes(ok.design, selectedShapes.map((s) => s.index), { color: null, height: null, hidden: null }));

  const load = (design: string) => {
    setSelection(null);
    t.set(param.id, design);
  };

  return {
    param,
    value,
    error: state.error,
    design: ok?.design ?? null,
    art: ok?.art ?? null,
    shapes: ok?.shapes ?? [],
    layers: ok?.layers ?? ([] as SvgLayer[]),
    layout: ok?.layout ?? null,
    mode,
    setMode,
    selection,
    setSelection,
    selectedShapes,
    selectedSet,
    selectedHeight,
    layerOf,
    shapesOf,
    pick,
    setHeight,
    recolor,
    recolorNew,
    setHidden,
    showShapes,
    resetShapes,
    load,
  };
}

export type DesignEditor = ReturnType<typeof useDesignEditor>;
