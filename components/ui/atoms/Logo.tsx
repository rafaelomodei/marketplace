/** Wordmark: a layered mark (a print, layer by layer) + the name in caps. */
export function Logo({ name = "Studio" }: { name?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
      </svg>
      <span className="text-[17px] font-medium tracking-[0.02em] uppercase">{name}</span>
    </span>
  );
}
