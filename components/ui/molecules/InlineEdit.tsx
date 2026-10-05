"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";

/**
 * Text that turns into a field when clicked (e.g. the name of a piece). Enter or clicking away saves, Esc cancels.
 * `editing` opens it already in the field (e.g. from a "Renomear" menu item); `onDone` says it closed.
 */
export function InlineEdit({
  value,
  onChange,
  label,
  maxLength = 80,
  editing: startEditing = false,
  onDone,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** What is being edited, for screen readers and the tooltip ("Nome da criação"). */
  label: string;
  maxLength?: number;
  editing?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (startEditing) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEditing]);

  function open() {
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => (input.current?.focus(), input.current?.select()));
  }
  function close(save: boolean) {
    if (!editing) return;
    setEditing(false);
    if (save && draft.trim() !== value) onChange(draft);
    onDone?.();
  }

  return editing ? (
    <input
      ref={input}
      autoFocus
      value={draft}
      maxLength={maxLength}
      aria-label={label}
      size={Math.max(8, draft.length + 1)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") close(true);
        else if (e.key === "Escape") close(false);
      }}
      className={cn("min-w-0 rounded-lg bg-canvas px-1.5 -mx-1.5 text-ink-strong ring-2 ring-ink-strong focus:outline-none", className)}
    />
  ) : (
    <button
      type="button"
      onClick={open}
      title={`${label}: clique para mudar`}
      className={cn("group/edit inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 -mx-1.5 text-left text-ink-strong transition hover:bg-surface", className)}
    >
      <span className="truncate">{value}</span>
      <Icon icon={Pencil} className="size-3.5 shrink-0 text-ink-faint transition group-hover/edit:text-ink-strong" />
    </button>
  );
}
