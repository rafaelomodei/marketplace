"use client";

import { ArrowRight, Check, RotateCcw, Sparkles, ThumbsDown, Undo2 } from "lucide-react";
import { useState } from "react";
import { JobCard, MODE_UI } from "@/components/studio";
import { Badge, Button, ChoiceGroup, Disclosure, EmptyState, Icon, ImageTile, SectionHeader } from "@/components/ui";
import { api, fileUrl, reportError } from "@/lib/client/api";
import type { ImageRow, JobRow } from "@/lib/db";
import { jobInputIds, normalizeParams, type JobType } from "@/lib/prompts";
import type { StepProps } from "./shared";

type Filter = "pending" | "approved" | "rejected" | "all";

export function ReviewStep({ product, reload, preview, goTo }: StepProps) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<number | string | null>(null);
  const jobsById = new Map(product.jobs.map((j) => [j.id, j]));
  const imagesById = new Map(product.images.map((i) => [i.id, i]));

  const active = product.jobs.filter((j) => j.status === "queued" || j.status === "running").reverse();
  const failed = product.jobs.filter((j) => j.status === "failed").slice(0, 5);
  const generated = product.images.filter((i) => i.kind === "generated");
  const count = (s: ImageRow["status"]) => generated.filter((i) => i.status === s).length;
  const candidates = generated.filter((i) => filter === "all" || i.status === filter);

  async function act(key: number | string, url: string, body: object) {
    setBusy(key);
    await api(url, { method: "POST", json: body }).catch(reportError);
    await reload();
    setBusy(null);
  }

  return (
    <div className="space-y-12">
      {(active.length > 0 || failed.length > 0) && (
        <section className="space-y-4">
          <SectionHeader size="heading" title="Em andamento" description="Você pode sair desta página: as imagens aparecem aqui quando ficarem prontas." />
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((job) => (
              <JobCard key={job.id} job={job} onCancel={() => act(job.id, `/api/jobs/${job.id}`, { action: "cancel" })} />
            ))}
            {failed.map((job) => (
              <JobCard key={job.id} job={job} onRetry={() => act(job.id, `/api/jobs/${job.id}`, { action: "retry" })} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-6">
        <SectionHeader
          size="heading"
          title="Escolha as melhores"
          description="Aprove só as imagens em que o produto ficou igual ao de verdade."
          action={
            count("approved") > 0 && (
              <Button variant="primary" onClick={() => goTo("publish")}>
                Preparar {count("approved")} para o marketplace <Icon icon={ArrowRight} />
              </Button>
            )
          }
        />
        <ChoiceGroup
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: `Para escolher · ${count("pending")}` },
            { value: "approved", label: `Aprovadas · ${count("approved")}` },
            { value: "rejected", label: `Descartadas · ${count("rejected")}` },
            { value: "all", label: "Todas" },
          ]}
        />
        {!candidates.length && (
          <EmptyState
            icon={Sparkles}
            tone="lilac"
            title={filter === "pending" ? "Nada para escolher agora" : "Nenhuma imagem aqui"}
            description={active.length ? "Suas imagens estão sendo criadas." : "Crie novas imagens a partir das fotos do produto."}
            action={
              !active.length && (
                <Button variant="primary" onClick={() => goTo("create")}>
                  Criar imagem
                </Button>
              )
            }
          />
        )}
        <div className="grid gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
          {candidates.map((img) => {
            const job = img.job_id ? jobsById.get(img.job_id) : undefined;
            return (
              <Candidate
                key={img.id}
                img={img}
                job={job}
                inputs={job ? (jobInputIds(normalizeParams(JSON.parse(job.params))).map((id) => imagesById.get(id)).filter(Boolean) as ImageRow[]) : []}
                slug={product.slug}
                busy={busy === img.id || (!!job && busy === job.id)}
                preview={preview}
                onReview={(action) => act(img.id, `/api/images/${img.id}`, { action })}
                onRetry={job ? () => act(job.id, `/api/jobs/${job.id}`, { action: "retry" }) : undefined}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Candidate({
  img,
  job,
  inputs,
  slug,
  busy,
  preview,
  onReview,
  onRetry,
}: {
  img: ImageRow;
  job?: JobRow;
  inputs: ImageRow[];
  slug: string;
  busy: boolean;
  preview: (rel: string) => void;
  onReview: (action: "approve" | "reject" | "reset") => void;
  onRetry?: () => void;
}) {
  const mode = job ? MODE_UI[job.type as JobType] : undefined;
  return (
    <article className="space-y-4">
      <ImageTile src={fileUrl(slug, img.rel, 800)} onZoom={() => preview(img.rel)} />
      <div className="flex items-center gap-2">
        <span className="font-medium tracking-[-0.01em] text-ink-strong">{mode?.title ?? "Imagem"}</span>
        {img.status === "approved" && (
          <Badge tone="success" dot>
            Aprovada
          </Badge>
        )}
        {img.status === "rejected" && <Badge>Descartada</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {img.status === "pending" ? (
          <>
            <Button variant="primary" disabled={busy} onClick={() => onReview("approve")}>
              <Icon icon={Check} /> Aprovar
            </Button>
            <Button disabled={busy} onClick={() => onReview("reject")}>
              <Icon icon={ThumbsDown} /> Descartar
            </Button>
          </>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => onReview("reset")}>
            <Icon icon={Undo2} /> Desfazer
          </Button>
        )}
        {onRetry && (
          <Button variant="ghost" disabled={busy} onClick={onRetry} title="Cria outra versão com as mesmas escolhas">
            <Icon icon={RotateCcw} /> Outra versão
          </Button>
        )}
      </div>
      {job && (
        <Disclosure summary="Detalhes">
          <div className="space-y-3">
            {inputs.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink-muted">A IA recebeu:</span>
                {inputs.map((i) => (
                  <button key={i.id} type="button" onClick={() => preview(i.rel)} className="cursor-zoom-in">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(slug, i.rel, 120)} alt="" className="size-11 rounded-lg object-cover ring-1 ring-line" />
                  </button>
                ))}
              </div>
            )}
            <pre className="max-h-60 overflow-auto rounded-xl bg-surface p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-soft">
              {job.prompt}
            </pre>
          </div>
        </Disclosure>
      )}
    </article>
  );
}
