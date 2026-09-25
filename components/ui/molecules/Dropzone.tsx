"use client";

import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "../atoms/Icon";
import { Spinner } from "../atoms/Spinner";

/** Drag-and-drop or click to pick images. Can be a big empty-state block or a compact tile. */
export function Dropzone({
  onFiles,
  busy,
  title = "Arraste as fotos aqui",
  hint = "ou clique para escolher · JPG, PNG ou WEBP",
  compact,
  className,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  title?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "grid cursor-pointer place-items-center rounded-card border-[1.5px] border-dashed text-center transition",
        over ? "border-ink-strong bg-sun/40" : "border-line-strong bg-surface hover:border-ink-faint hover:bg-canvas",
        compact ? "aspect-square p-3" : "px-6 py-12",
        className,
      )}
    >
      <span className="flex flex-col items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-canvas text-ink-strong shadow-float">
          {busy ? <Spinner /> : <Icon icon={ImagePlus} className="size-5" />}
        </span>
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-ink-strong">{busy ? "Enviando…" : compact ? "Adicionar" : title}</span>
          {!compact && <span className="block text-xs text-ink-muted">{hint}</span>}
        </span>
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </label>
  );
}
