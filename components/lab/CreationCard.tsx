"use client";

import { Copy, MoreHorizontal, Pencil, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Dropdown, Icon, IconTile, InlineEdit, MenuItem, Spinner } from "@/components/ui";
import type { LabCreationSummary } from "@/lib/lab/creations";
import { whenPtBr } from "@/lib/text";
import { toolLook } from "./ToolCard";

/**
 * A saved piece in a Lab tool's history: its picture and name open it in the editor; the menu sends it to the Studio
 * (mockup for the marketplace, or opens the product made from it), renames, copies or deletes it. `busy`: being sent.
 */
export function CreationCard({
  creation,
  busy,
  onToStudio,
  onRename,
  onDuplicate,
  onDelete,
}: {
  creation: LabCreationSummary;
  busy?: boolean;
  onToStudio: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const look = toolLook(creation.tool);
  const href = `/lab/${creation.tool}/${creation.id}`;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group space-y-3">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden rounded-card bg-surface ring-1 ring-line ring-inset transition group-hover:shadow-lift">
        {creation.hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/lab/creations/${creation.id}/thumbnail?v=${encodeURIComponent(creation.updatedAt)}`}
            alt=""
            className="size-full object-contain p-4 transition duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <IconTile icon={look.icon} tone={look.tone} size="lg" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-canvas/80 p-4 text-center text-sm text-ink-strong backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <Spinner /> Preparando as imagens do 3D…
            </span>
          </div>
        )}
        {creation.product && !busy && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-canvas/90 px-2.5 py-1 text-xs font-medium text-ink-strong shadow-float">
            <Icon icon={Store} className="size-3.5" /> No Studio
          </span>
        )}
      </Link>
      <div className="flex items-start gap-2 px-0.5">
        {renaming ? (
          <div className="min-w-0 flex-1 space-y-0.5">
            <InlineEdit
              editing
              label="Nome da criação"
              value={creation.name}
              onChange={onRename}
              onDone={() => setRenaming(false)}
              className="w-full font-medium tracking-[-0.01em]"
            />
            <span className="block truncate text-sm text-ink-muted">Enter para salvar · Esc para cancelar</span>
          </div>
        ) : (
          <Link href={href} className="min-w-0 flex-1 space-y-0.5">
            <span className="block truncate font-medium tracking-[-0.01em] text-ink-strong">{creation.name}</span>
            <span className="block truncate text-sm text-ink-muted">Editado {whenPtBr(creation.updatedAt)}</span>
          </Link>
        )}
        <Dropdown
          trigger={(open, toggle) => (
            <Button
              variant="ghost"
              size="icon"
              aria-expanded={open}
              aria-label={`Mais opções de ${creation.name}`}
              onClick={() => (setConfirming(false), toggle())}
            >
              <Icon icon={MoreHorizontal} />
            </Button>
          )}
          className="w-60"
        >
          {(close) => (
            <div className="space-y-0.5">
              {creation.product ? (
                <Link
                  href={`/products/${creation.product}`}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink-strong transition hover:bg-surface"
                  onClick={close}
                >
                  <Icon icon={Store} /> Abrir no Studio
                </Link>
              ) : (
                <MenuItem disabled={busy} onClick={() => (onToStudio(), close())}>
                  <Icon icon={Store} />
                  <span className="flex-1">
                    <span className="block">Gerar mockup para o marketplace</span>
                    <span className="block text-xs text-ink-muted">Leva para o Studio com imagens do 3D</span>
                  </span>
                </MenuItem>
              )}
              <MenuItem onClick={() => (setRenaming(true), close())}>
                <Icon icon={Pencil} /> Renomear
              </MenuItem>
              <MenuItem onClick={() => (onDuplicate(), close())}>
                <Icon icon={Copy} /> Fazer uma cópia
              </MenuItem>
              {confirming ? (
                <MenuItem className="text-danger hover:bg-danger-soft" onClick={() => (onDelete(), close())}>
                  <Icon icon={Trash2} /> Clique de novo para excluir
                </MenuItem>
              ) : (
                <MenuItem className="text-danger" onClick={() => setConfirming(true)}>
                  <Icon icon={Trash2} /> Excluir
                </MenuItem>
              )}
            </div>
          )}
        </Dropdown>
      </div>
    </div>
  );
}
