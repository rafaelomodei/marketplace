"use client";

import { useImperativeHandle, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ringsPath, shapeAt, type DesignShape, type SvgLayout } from "@/lib/lab/svg";
import type { ToolGuide } from "@/lib/lab/types";
import type { ViewerHandle } from "../ModelViewer";

type View = { k: number; x: number; y: number };

/**
 * The drawing seen from above at its real size (mm): colors as they will be printed, the base border, the tool's guides
 * (e.g. the clip). Drag to move, scroll to zoom, click to pick a shape. Same `handle` as the 3D viewer (fit/zoom).
 * Guides with `drag` (the clip and its slot) show "move" and are dragged with `onDrag` (mm from where it started).
 */
export function DesignCanvas({
  layout,
  border,
  baseColor,
  fillOf,
  selected,
  onPick,
  guides = [],
  guideColor,
  handle,
  interactive = true,
  onDrag,
  className,
}: {
  layout: SvgLayout;
  border: number;
  baseColor: string;
  fillOf: (s: DesignShape) => string;
  selected: Set<number>;
  onPick?: (shape: DesignShape | null) => void;
  guides?: ToolGuide[];
  guideColor: (part?: string) => string;
  handle?: React.Ref<ViewerHandle>;
  interactive?: boolean;
  onDrag?: (part: string, delta: [number, number], done: boolean) => void;
  className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const moving = useRef<{ part: string; from: [number, number]; last: [number, number] } | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const handles = interactive && onDrag ? guides.filter((g) => g.drag) : [];

  // Frame (mm, y up): the drawing with its border plus the guides (the clip hangs below), with a small margin.
  const liveFrame = useMemo(() => {
    const b = guides.reduce(
      (f, g) => [Math.min(f[0], g.box[0]), Math.min(f[1], g.box[1]), Math.max(f[2], g.box[2]), Math.max(f[3], g.box[3])],
      [-layout.width / 2 - border, -border, layout.width / 2 + border, layout.height + border],
    );
    const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.08;
    return { cx: (b[0] + b[2]) / 2, cy: -(b[1] + b[3]) / 2, w: b[2] - b[0] + 2 * pad, h: b[3] - b[1] + 2 * pad };
  }, [layout, border, guides]);
  // Kept still while something is dragged (the clip moving would move the frame under the pointer).
  const frameRef = useRef(liveFrame);
  if (!moving.current) frameRef.current = liveFrame;
  const frame = frameRef.current;

  const vw = frame.w / view.k;
  const vh = frame.h / view.k;
  const vx = frame.cx + view.x - vw / 2;
  const vy = frame.cy + view.y - vh / 2;

  /** mm per screen pixel (the SVG keeps its aspect ratio: "meet"). */
  const mmPerPx = () => {
    const r = svg.current!.getBoundingClientRect();
    return Math.max(vw / r.width, vh / r.height);
  };
  /** Screen point → drawing mm (y up). */
  const toMm = (clientX: number, clientY: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const s = mmPerPx();
    return [vx + vw / 2 + (clientX - r.left - r.width / 2) * s, -(vy + vh / 2 + (clientY - r.top - r.height / 2) * s)];
  };

  const zoomAt = (factor: number, clientX?: number, clientY?: number) =>
    setView((v) => {
      const k = Math.min(20, Math.max(0.5, v.k * factor));
      if (clientX === undefined || clientY === undefined) return { ...v, k };
      // Keep the point under the cursor in place.
      const r = svg.current!.getBoundingClientRect();
      const s = mmPerPx();
      const dx = (clientX - r.left - r.width / 2) * s;
      const dy = (clientY - r.top - r.height / 2) * s;
      const ratio = v.k / k;
      return { k, x: v.x + dx - dx * ratio, y: v.y + dy - dy * ratio };
    });

  useImperativeHandle(handle, () => ({ fit: () => setView({ k: 1, x: 0, y: 0 }), zoom: (f) => zoomAt(1 / f) }));

  const selectedShapes = layout.shapes.filter((s) => selected.has(s.index));

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface",
        "bg-[repeating-conic-gradient(var(--color-panel)_0_25%,transparent_0_50%)] bg-[length:18px_18px]",
        className,
      )}
    >
      <svg
        ref={svg}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        className={cn("absolute inset-0 size-full touch-none select-none", interactive && "cursor-crosshair")}
        role="img"
        aria-label="Desenho visto de cima"
        onWheel={interactive ? (e) => zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY) : undefined}
        onPointerDown={
          interactive
            ? (e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                const part = (e.target as Element).closest("[data-drag]")?.getAttribute("data-drag");
                if (part) moving.current = { part, from: toMm(e.clientX, e.clientY), last: [0, 0] };
                else drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (e) => {
                const m = moving.current;
                if (m) {
                  const [x, y] = toMm(e.clientX, e.clientY);
                  m.last = [x - m.from[0], y - m.from[1]];
                  return onDrag?.(m.part, m.last, false);
                }
                const d = drag.current;
                if (!d) return;
                const dx = e.clientX - d.x;
                const dy = e.clientY - d.y;
                if (!d.moved && Math.hypot(dx, dy) < 4) return;
                d.moved = true;
                const s = mmPerPx();
                setView({ ...d.view, x: d.view.x - dx * s, y: d.view.y - dy * s });
              }
            : undefined
        }
        onPointerUp={
          interactive
            ? (e) => {
                const m = moving.current;
                moving.current = null;
                if (m) return onDrag?.(m.part, m.last, true);
                const d = drag.current;
                drag.current = null;
                if (d && !d.moved) onPick?.(shapeAt(layout, toMm(e.clientX, e.clientY)) ?? null);
              }
            : undefined
        }
      >
        <g transform="scale(1 -1)">
          {guides
            .filter((g) => g.kind === "ghost")
            .map((g, i) => (
              <path key={`g${i}`} d={g.d} fill="none" stroke={guideColor(g.part)} strokeWidth={g.width ?? 0.8} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          {border > 0 &&
            layout.shapes.map((s) => (
              <path key={`b${s.index}`} d={ringsPath(s.rings)} fill={baseColor} stroke={baseColor} strokeWidth={border * 2} strokeLinejoin="round" fillRule="evenodd" />
            ))}
          {layout.shapes.map((s) => (
            <path
              key={s.index}
              d={ringsPath(s.rings)}
              fill={fillOf(s)}
              fillRule="evenodd"
              className="transition-opacity"
              opacity={selected.size && !selected.has(s.index) ? 0.45 : 1}
            />
          ))}
          {guides
            .filter((g) => g.kind === "cut")
            .map((g, i) => (
              <path key={`c${i}`} d={g.d} fill="none" className="stroke-ink-strong" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            ))}
          {/* Grab areas of the draggable guides: the whole outline of the clip and of its slot (the wire alone is too thin). */}
          {handles.map((g, i) => (
            <rect
              key={`h${i}`}
              data-drag={g.drag}
              x={g.box[0]}
              y={g.box[1]}
              width={g.box[2] - g.box[0]}
              height={g.box[3] - g.box[1]}
              fill="transparent"
              className="cursor-move"
            >
              <title>Arraste para mover</title>
            </rect>
          ))}
          {/* Selection: a white halo under a dark dashed line, readable on any color. */}
          {selectedShapes.map((s) => (
            <g key={`s${s.index}`} fill="none" fillRule="evenodd" vectorEffect="non-scaling-stroke">
              <path d={ringsPath(s.rings)} className="stroke-canvas" strokeWidth={4} vectorEffect="non-scaling-stroke" />
              <path d={ringsPath(s.rings)} className="stroke-ink-strong" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
