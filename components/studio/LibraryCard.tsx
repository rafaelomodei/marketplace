import Link from "next/link";
import { Box } from "lucide-react";
import { Badge, Card, Icon, Spinner, Swatch } from "@/components/ui";
import { libraryPictureUrl } from "@/lib/client/api";
import type { ProjectSummary, Variant } from "@/lib/library";
import { formatDuration, formatMoney, formatSize } from "@/lib/text";

const variantLabel = (v: Variant) => `${v.printer ?? v.name}${v.filaments.map((f) => f.type).join("+")}`;

/** One ready-to-print version; `named` shows the file name when printer and material alone don't tell it apart. */
function VariantRow({ v, named }: { v: Variant; named?: boolean }) {
  const busy = v.status === "queued" || v.status === "running";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 -space-x-1">
          {v.filaments.slice(0, 4).map((f, i) => <Swatch key={i} color={f.color} className="size-3.5 ring-2 ring-canvas" />)}
        </span>
        <span className="truncate text-ink-strong" title={v.name}>
          {v.printer ?? v.name}
          {v.filaments.length > 0 && <span className="text-ink-muted"> · {[...new Set(v.filaments.map((f) => f.type))].join(" + ")}</span>}
        </span>
      </div>
      <span className="text-right tabular-nums text-ink-strong">
        {v.total !== null ? <>{formatMoney(v.total)}<span className="text-xs text-ink-muted"> /un.</span></> : busy ? <Spinner className="size-3.5 text-ink-faint" /> : "—"}
      </span>
      <span className="col-span-2 truncate text-xs text-ink-muted">
        {busy
          ? "Calculando…"
          : v.status === "done"
            ? [named && v.name, v.units > 1 && `${v.units} por impressão`, v.seconds !== null && formatDuration(v.seconds), v.price !== null && `sugerido ${formatMoney(v.price)}`].filter(Boolean).join(" · ")
            : v.status === "failed" ? "Não consegui calcular" : v.process ?? v.name}
      </span>
    </li>
  );
}

/**
 * A project of the print library, wide: picture on the left; size, sale prices and every ready-to-print version
 * (printer/material) with its cost per object on the right. With `printer`, only that printer's versions are listed.
 */
export function LibraryCard({ project, printer }: { project: ProjectSummary; /** Only the versions for this printer. */ printer?: string }) {
  const variants = printer ? project.variants.filter((v) => v.printer === printer) : project.variants;
  /** Headline price: one unit when priced, else the smallest kit. */
  const sale = project.salePrices.find((t) => t.quantity === 1) ?? project.salePrices[0];
  const kits = project.salePrices.filter((t) => t !== sale);
  const suggested = variants.find((v) => v.price !== null)?.price ?? null;

  return (
    <Link href={`/biblioteca/${project.slug}`} className="group block h-full">
      <Card className="grid h-full grid-cols-[7.5rem_minmax(0,1fr)] gap-4 p-3 ring-1 ring-line ring-inset transition group-hover:shadow-lift sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5 sm:p-4">
        <div className="relative aspect-square self-start overflow-hidden rounded-card bg-surface">
          {project.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={libraryPictureUrl(project.slug, project.cover.file, project.cover.plate, 480, project.updatedAt)}
              alt=""
              loading="lazy"
              className="size-full object-contain transition duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid size-full place-items-center text-ink-faint"><Icon icon={Box} className="size-8" /></div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            {project.categories.length > 0 && (
              <div className="flex flex-wrap gap-1">{project.categories.slice(0, 3).map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
            )}
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-medium tracking-[-0.02em] text-ink-strong">{project.name}</span>
              {project.calculating && <Spinner className="size-3.5 shrink-0 text-warning" />}
            </div>
            <p className="truncate text-sm text-ink-soft">
              {project.object.size ? formatSize(project.object.size) : <span className="text-ink-muted">Tamanho a informar</span>}
              {project.object.pieces && project.object.pieces > 1 ? ` · ${project.object.pieces} peças por objeto` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {sale ? (
              <span className="text-xl tracking-[-0.02em] tabular-nums text-ink-strong" title="Preço de venda">
                {formatMoney(sale.price)}
                <span className="text-sm text-ink-muted"> {sale.quantity > 1 ? `${sale.quantity} un.` : "un."}</span>
              </span>
            ) : suggested !== null ? (
              <span className="text-sm text-ink-muted" title="Ainda sem preço de venda">Sugerido {formatMoney(suggested)} /un.</span>
            ) : null}
            {kits.length > 0 && <span className="text-sm text-ink-soft">{kits.map((t) => `${t.quantity} un. ${formatMoney(t.price)}`).join(" · ")}</span>}
          </div>

          {variants.length > 0 ? (
            <ul className="divide-y divide-line border-t border-line">
              {variants.slice(0, 4).map((v) => <VariantRow key={v.file} v={v} named={variants.filter((x) => variantLabel(x) === variantLabel(v)).length > 1} />)}
              {variants.length > 4 && <li className="pt-2 text-xs text-ink-muted">+ {variants.length - 4} variações</li>}
            </ul>
          ) : (
            <p className="border-t border-line pt-2 text-sm text-ink-muted">
              {project.files.source ? `${project.files.source} ${project.files.source === 1 ? "arquivo" : "arquivos"} · falta configurar no fatiador` : "Sem arquivos"}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
