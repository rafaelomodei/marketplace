"use client";

import { Minus, Plus, Scan, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

const MIN = 1;
const MAX = 8;
const STEP = 1.5;
const DOUBLE_CLICK_ZOOM = 3;

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };

/**
 * Full-screen image preview. The image always fits the screen; zoom with the wheel, pinch,
 * double click or the +/− buttons, and drag to pan. Closes with Esc, the X or a click outside the image.
 */
export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(FIT);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; view: View; dist?: number; moved: boolean; outside?: boolean } | null>(null);

  useEffect(() => setView(FIT), [src]);

  /** Keeps the image from being dragged away from the screen. */
  const clamp = useCallback((v: View): View => {
    const el = img.current;
    const box = stage.current?.getBoundingClientRect();
    if (!el || !box) return v;
    const scale = Math.min(MAX, Math.max(MIN, v.scale));
    const maxX = Math.max(0, (el.offsetWidth * scale - box.width) / 2);
    const maxY = Math.max(0, (el.offsetHeight * scale - box.height) / 2);
    return { scale, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
  }, []);

  /**
   * Zooms keeping the point under (clientX, clientY) still; defaults to the screen center.
   * `scale` may be a function of the current scale, so fast wheel events never use a stale value.
   */
  const zoomTo = useCallback(
    (scale: number | ((current: number) => number), clientX?: number, clientY?: number) =>
      setView((v) => {
        const box = stage.current?.getBoundingClientRect();
        if (!box) return v;
        const next = Math.min(MAX, Math.max(MIN, typeof scale === "function" ? scale(v.scale) : scale));
        const px = (clientX ?? box.left + box.width / 2) - (box.left + box.width / 2);
        const py = (clientY ?? box.top + box.height / 2) - (box.top + box.height / 2);
        const k = next / v.scale;
        return clamp({ scale: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
      }),
    [clamp],
  );

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomTo((s) => s * STEP);
      else if (e.key === "-") zoomTo((s) => s / STEP);
      else if (e.key === "0") setView(FIT);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [src, onClose, zoomTo]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo((s) => s * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [src, zoomTo]);

  if (!src) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const dist = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined;
    // Pointer capture retargets later events to the stage, so remember where the press started.
    gesture.current = { x: e.clientX, y: e.clientY, view, dist, moved: false, outside: e.target === stage.current };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      g.moved = true;
      zoomTo(g.view.scale * (dist / g.dist), (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
    if (g.view.scale > 1) setView(clamp({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      setDragging(false);
      // A plain click outside the image closes; drags and pinches never do.
      if (g && !g.moved && g.outside) onClose();
      gesture.current = null;
    } else if (g) {
      const [p] = [...pointers.current.values()];
      gesture.current = { x: p.x, y: p.y, view, moved: true };
    }
  };

  const zoomed = view.scale > 1.001;

  return (
    <div role="dialog" aria-modal aria-label="Visualizar imagem" className="fixed inset-0 z-50 animate-fade-up bg-ink-strong/90 backdrop-blur-sm">
      <div
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => (zoomed ? setView(FIT) : zoomTo(DOUBLE_CLICK_ZOOM, e.clientX, e.clientY))}
        className={cn(
          "absolute inset-0 flex touch-none items-center justify-center overflow-hidden p-4 pb-20 select-none sm:p-8 sm:pb-24",
          zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={img}
          src={src}
          alt=""
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          className={cn(
            "max-h-full max-w-full rounded-card object-contain shadow-lift will-change-transform",
            !dragging && "transition-transform duration-150 ease-out",
          )}
        />
      </div>

      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-ink-strong/70 text-white ring-1 ring-white/15 backdrop-blur-xl transition hover:bg-ink-strong"
      >
        <Icon icon={X} className="size-5" />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink-strong/70 p-1 text-white ring-1 ring-white/15 backdrop-blur-xl">
          <ToolbarButton label="Diminuir zoom" icon={Minus} disabled={!zoomed} onClick={() => zoomTo((s) => s / STEP)} />
          <span className="w-14 text-center text-xs tabular-nums">{Math.round(view.scale * 100)}%</span>
          <ToolbarButton label="Aumentar zoom" icon={Plus} disabled={view.scale >= MAX} onClick={() => zoomTo((s) => s * STEP)} />
          <span className="mx-1 h-5 w-px bg-white/20" />
          <ToolbarButton label="Caber na tela" icon={Scan} disabled={!zoomed} onClick={() => setView(FIT)} />
        </div>
        <p className="hidden rounded-full bg-ink-strong/50 px-3 py-1 text-xs text-white/70 backdrop-blur sm:block">Role ou dê dois cliques para dar zoom · arraste para mover · Esc fecha</p>
      </div>
    </div>
  );
}

function ToolbarButton({ label, icon, onClick, disabled }: { label: string; icon: typeof X; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full transition hover:bg-canvas/20 disabled:opacity-35 disabled:hover:bg-transparent"
    >
      <Icon icon={icon} />
    </button>
  );
}
