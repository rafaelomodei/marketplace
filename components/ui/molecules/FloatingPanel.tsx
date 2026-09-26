import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

/** Card that floats over a canvas (editor panels): title, optional close, scrolling content. */
export function FloatingPanel({
  title,
  onClose,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  onClose?: () => void;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex max-h-full flex-col overflow-hidden rounded-card bg-canvas/95 shadow-lift ring-1 ring-black/5 backdrop-blur-xl", className)}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="flex-1 text-sm font-medium text-ink-strong">{title}</h2>
        {actions}
        {onClose && (
          <button type="button" aria-label="Fechar" onClick={onClose} className="grid size-7 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink-strong">
            <Icon icon={X} className="size-3.5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  );
}
