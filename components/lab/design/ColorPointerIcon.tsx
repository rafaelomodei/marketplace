import { Pointer } from "lucide-react";
import { useId } from "react";

/** "Select every shape of this color": a pointing hand painted with a gradient of the palette's status colors. */
export function ColorPointerIcon({ className = "size-5" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-danger)" }} />
            <stop offset="0.35" style={{ stopColor: "var(--color-warning)" }} />
            <stop offset="0.65" style={{ stopColor: "var(--color-accent)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-lake)" }} />
          </linearGradient>
        </defs>
      </svg>
      <Pointer aria-hidden className={className} strokeWidth={2} color={`url(#${id})`} />
    </>
  );
}
