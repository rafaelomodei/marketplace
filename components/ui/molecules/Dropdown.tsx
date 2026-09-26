"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/** Gap between the trigger and the box, and the margin kept to the edges of the screen (px). */
const GAP = 8;
const EDGE = 12;

type Place = { up: boolean; room: number; top?: number; bottom?: number; left?: number; right?: number };

/** Where the box goes: toward the side of the screen with more room, aligned to the trigger's start or end. */
function placeFor(trigger: DOMRect, align: "start" | "end"): Place {
  const below = window.innerHeight - trigger.bottom;
  const up = below < trigger.top;
  return {
    up,
    room: Math.max(160, (up ? trigger.top : below) - GAP - EDGE),
    ...(up ? { bottom: window.innerHeight - trigger.top + GAP } : { top: trigger.bottom + GAP }),
    ...(align === "end" ? { right: Math.max(EDGE, window.innerWidth - trigger.right) } : { left: Math.max(EDGE, trigger.left) }),
  };
}

/**
 * A trigger that opens a floating box; closes on outside click or Escape.
 * The box floats above the whole page, full-screen editors included (so panels that scroll or clip never hide it), opens toward the side of the
 * screen with more room — up when the trigger sits low, like in a bottom bar — and never grows past the visible
 * area: longer content scrolls inside it.
 * `trigger` receives whether it is open; `children` can be a function to close after an action.
 */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (open: boolean, toggle: () => void) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Follow the trigger while open (window resized, panel scrolled).
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => anchor.current && setPlace(placeFor(anchor.current.getBoundingClientRect(), align));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => anchor.current?.contains(t as Node) || panel.current?.contains(t as Node);
    const onDown = (e: PointerEvent) => !inside(e.target) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div ref={anchor} className="relative">
      {trigger(open, () => setOpen(!open))}
      {open &&
        place &&
        createPortal(
          <div
            ref={panel}
            style={{ top: place.top, bottom: place.bottom, left: place.left, right: place.right, maxHeight: place.room }}
            className={cn(
              "fixed z-[60] max-w-[calc(100vw-1.5rem)] min-w-56 overflow-y-auto overscroll-contain rounded-card bg-canvas p-1.5 shadow-lift ring-1 ring-black/5",
              className,
            )}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Row of a dropdown menu. */
export function MenuItem({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink-strong transition hover:bg-surface disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
