"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, Spinner, Swatch } from "@/components/ui";
import { action, projectPictureUrl } from "@/lib/client/api";
import type { ProjectPicture, ProjectSummary, VariationSummary } from "@/lib/library";
import { formatDuration, formatGrams, formatMm, formatMoney } from "@/lib/text";
import { PlateViewer, type ViewerPicture } from "./PlateViewer";

const THUMB = 320;
const SHOWN = 4;

/**
 * The card picture: the cover, with arrows through the 3MF plates and the photos sent. Only the cover loads with the
 * list; the other pictures are listed on the first arrow click and each loads as a small thumbnail when shown.
 */
function CardPictures({ project }: { project: ProjectSummary }) {
  const href = `/biblioteca/${project.slug}`;
  const first: ViewerPicture[] = project.cover ? [{ key: "cover", src: projectPictureUrl(project.slug, project.cover, THUMB) }] : [];
  const load = async () => {
    const { pictures } = await action<{ pictures: ProjectPicture[] }>("list_library_pictures", { project: project.slug, all: false });
    return pictures.map((p, i) => ({ key: String(i), src: projectPictureUrl(project.slug, p, THUMB, p.version), label: p.label }));
  };
  return (
    // `key`: a new cover (or new files) starts again from the cover.
    <PlateViewer key={project.updatedAt} slug={project.slug} pictures={first} total={project.pictures} loadPictures={load} compact width={THUMB} className="ring-0">
      <Link href={href} tabIndex={-1} aria-hidden className="absolute inset-0" />
    </PlateViewer>
  );
}

/** One fact of the product: small label over its value. */
function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="truncate text-sm font-medium tabular-nums text-ink-strong">{children}</dd>
    </div>
  );
}

/** Material, size (X/Y/Z) and pieces of the finished object. */
function ProductSpecs({ project }: { project: ProjectSummary }) {
  const filaments = [...new Map(project.variations.flatMap((v) => v.filaments).map((f) => [`${f.type}${f.color}`, f])).values()];
  const types = [...new Set(filaments.map((f) => f.type).filter(Boolean))];
  const size = project.object.size ?? project.variations.find((v) => v.measured)?.measured ?? null;
  const pieces = project.object.pieces ?? 1;
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
      <Spec label="Material" className="col-span-2">
        {types.length ? (
          <span className="flex items-center gap-1.5">
            <span className="flex shrink-0 -space-x-1">{filaments.slice(0, 5).map((f, i) => <Swatch key={i} color={f.color} className="size-3 ring-2 ring-canvas" />)}</span>
            <span className="truncate">{types.join(" + ")}</span>
          </span>
        ) : <span className="font-normal text-ink-muted">A calcular</span>}
      </Spec>
      <Spec label="Peças por objeto">{pieces}</Spec>
      {size ? (
        <>
          <Spec label="Largura (X)">{formatMm(size.width)} mm</Spec>
          <Spec label="Profundidade (Y)">{formatMm(size.depth)} mm</Spec>
          <Spec label="Altura (Z)">{formatMm(size.height)} mm</Spec>
        </>
      ) : (
        <Spec label="Tamanho" className="col-span-3"><span className="font-normal text-ink-muted">A informar</span></Spec>
      )}
    </dl>
  );
}

/** What is different about this variation, when the title does not already say it. */
const details = (v: VariationSummary) =>
  [v.size, v.feature].filter((x) => x && !v.title.toLowerCase().includes(x.toLowerCase()));

/** One variation: what it is on the left, production cost (red) and sale price (green) per unit on the right. */
function VariationRow({ v }: { v: VariationSummary }) {
  const sale = v.salePrices.find((t) => t.quantity === 1) ?? v.salePrices[0];
  const kits = v.salePrices.filter((t) => t !== sale);
  const busy = v.status === "calculating";
  const profit = sale && sale.quantity === 1 && v.cost !== null ? sale.price - v.cost : null;
  const info = [
    ...details(v),
    v.grams !== null && formatGrams(v.grams),
    v.seconds !== null && formatDuration(v.seconds),
    v.units > 1 && `${v.units} por impressão`,
    v.parts > 1 && `${v.parts} partes`,
  ].filter(Boolean);

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-start gap-x-3 py-2.5">
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium text-ink-strong" title={v.title}>{v.title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {busy ? "Calculando…" : v.status === "empty" ? "Sem arquivo para imprimir" : v.status === "waiting" ? "Falta calcular" : info.join(" · ")}
        </p>
      </div>

      <div className="text-right">
        {v.cost !== null ? (
          <span className="text-base font-semibold tabular-nums text-danger">{formatMoney(v.cost)}</span>
        ) : busy ? (
          <Spinner className="ml-auto size-4 text-ink-faint" />
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </div>

      <div className="text-right">
        {sale ? (
          <>
            <span className="text-base font-semibold tabular-nums text-success">{formatMoney(sale.price)}</span>
            {sale.quantity > 1 && <span className="block text-xs text-ink-muted">{sale.quantity} un.</span>}
            {profit !== null && <span className={`block text-xs tabular-nums ${profit < 0 ? "text-danger" : "text-ink-muted"}`}>{profit < 0 ? "prejuízo" : "lucro"} {formatMoney(Math.abs(profit))}</span>}
            {kits.map((t) => <span key={t.quantity} className="block text-xs tabular-nums text-ink-soft">{t.quantity} un. {formatMoney(t.price)}</span>)}
          </>
        ) : v.suggested !== null ? (
          <span title="Ainda sem preço de venda: valor sugerido pela margem">
            <span className="text-base font-semibold tabular-nums text-success/60">{formatMoney(v.suggested)}</span>
            <span className="block text-xs text-ink-muted">sugerido</span>
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </div>
    </li>
  );
}

/**
 * A project of the print library: picture, name and the product's facts (material, size X/Y/Z, pieces) on top;
 * below, every variation with what it costs to produce (red) and what it sells for (green), per unit.
 */
export function LibraryCard({ project }: { project: ProjectSummary }) {
  const variations = project.variations;

  return (
    // The whole card opens the project through a link laid over it; only the picture sits above (its arrows must not open it).
    <div className="group relative h-full">
      <Card className="flex h-full flex-col gap-4 p-3 ring-1 ring-line ring-inset transition group-hover:shadow-lift sm:p-4">
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="relative z-10 self-start">
            <CardPictures project={project} />
          </div>
          <div className="min-w-0 space-y-3">
            <div className="space-y-1.5">
              {project.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">{project.categories.slice(0, 3).map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
              )}
              <div className="flex items-start gap-2">
                <span className="line-clamp-2 text-lg leading-snug font-medium tracking-[-0.02em] text-ink-strong" title={project.name}>{project.name}</span>
                {project.calculating && <Spinner className="mt-1.5 size-3.5 shrink-0 text-warning" />}
              </div>
            </div>
            <ProductSpecs project={project} />
          </div>
        </div>

        <div className="mt-auto border-t border-line">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-x-3 pt-2.5 text-xs text-ink-muted">
            <span>{variations.length > 1 ? `${variations.length} variações` : "Variação"}</span>
            <span className="text-right">Custo /un.</span>
            <span className="text-right">Venda</span>
          </div>
          <ul className="divide-y divide-line">
            {variations.slice(0, SHOWN).map((v) => <VariationRow key={v.id} v={v} />)}
          </ul>
          {variations.length > SHOWN && <p className="pt-1 text-xs text-ink-muted">+ {variations.length - SHOWN} variações</p>}
        </div>
      </Card>
      <Link href={`/biblioteca/${project.slug}`} aria-label={project.name} className="absolute inset-0 rounded-card focus-visible:ring-2 focus-visible:ring-ink-strong" />
    </div>
  );
}
