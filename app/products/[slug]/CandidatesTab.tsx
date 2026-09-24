"use client";

import { useState } from "react";
import { api, Badge, Button, Card, Elapsed, fileUrl, Spinner } from "@/components/ui";
import type { ImageRow, JobRow } from "@/lib/db";
import { jobInputIds, JOB_TYPE_LABEL, type JobParams, type JobType } from "@/lib/prompts";
import { alertError, type TabProps } from "./shared";

type Filter = "pending" | "approved" | "rejected" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Para revisar" },
  { id: "approved", label: "Aprovadas" },
  { id: "rejected", label: "Rejeitadas" },
  { id: "all", label: "Todas" },
];

export function CandidatesTab({ product, reload, preview, goTo }: TabProps) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<number | string | null>(null);
  const jobsById = new Map(product.jobs.map((j) => [j.id, j]));
  const imagesById = new Map(product.images.map((i) => [i.id, i]));

  const active = product.jobs.filter((j) => j.status === "queued" || j.status === "running").reverse();
  const failed = product.jobs.filter((j) => j.status === "failed").slice(0, 5);
  const candidates = product.images.filter((i) => i.kind === "generated" && (filter === "all" || i.status === filter));

  async function act(key: number | string, url: string, body: object) {
    setBusy(key);
    await api(url, { method: "POST", json: body }).catch(alertError);
    await reload();
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      {(active.length > 0 || failed.length > 0) && (
        <section className="space-y-2">
          <h2 className="font-medium">Fila do Codex</h2>
          {active.map((job) => (
            <JobCard key={job.id} job={job} onCancel={() => act(job.id, `/api/jobs/${job.id}`, { action: "cancel" })} />
          ))}
          {failed.map((job) => (
            <JobCard key={job.id} job={job} onRetry={() => act(job.id, `/api/jobs/${job.id}`, { action: "retry" })} />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-medium">Candidatas</h2>
          {FILTERS.map((f) => (
            <Button key={f.id} variant={filter === f.id ? "primary" : "ghost"} onClick={() => setFilter(f.id)}>
              {f.label}
            </Button>
          ))}
        </div>
        {!candidates.length && (
          <p className="text-sm text-stone-400">
            Nada aqui. <button className="underline" onClick={() => goTo("generate")}>Gerar imagens</button>
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {candidates.map((img) => {
            const job = img.job_id ? jobsById.get(img.job_id) : undefined;
            const params = job ? (JSON.parse(job.params) as JobParams) : null;
            const inputs = params ? jobInputIds(params).map((id) => imagesById.get(id)).filter(Boolean) as ImageRow[] : [];
            return (
              <Card key={img.id} className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(product.slug, img.rel, 800)}
                  alt=""
                  onClick={() => preview(img.rel)}
                  className="aspect-square w-full cursor-zoom-in bg-stone-100 object-contain"
                />
                <div className="space-y-3 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{job ? JOB_TYPE_LABEL[job.type as JobType] : "Imagem"}</span>
                    <StatusBadge status={img.status} />
                    <span className="ml-auto text-xs text-stone-400">{img.label}</span>
                  </div>
                  {inputs.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-stone-400">entrada:</span>
                      {inputs.map((i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i.id}
                          src={fileUrl(product.slug, i.rel, 120)}
                          alt=""
                          onClick={() => preview(i.rel)}
                          className="size-10 cursor-zoom-in rounded border border-stone-200 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {img.status !== "approved" && (
                      <Button variant="success" disabled={busy === img.id} onClick={() => act(img.id, `/api/images/${img.id}`, { action: "approve" })}>
                        ✓ Aprovar
                      </Button>
                    )}
                    {img.status !== "rejected" && (
                      <Button variant="danger" disabled={busy === img.id} onClick={() => act(img.id, `/api/images/${img.id}`, { action: "reject" })}>
                        Rejeitar
                      </Button>
                    )}
                    {img.status !== "pending" && (
                      <Button variant="ghost" disabled={busy === img.id} onClick={() => act(img.id, `/api/images/${img.id}`, { action: "reset" })}>
                        Desfazer
                      </Button>
                    )}
                    {job && (
                      <Button variant="ghost" disabled={busy === job.id} onClick={() => act(job.id, `/api/jobs/${job.id}`, { action: "retry" })}>
                        ↻ Gerar outra
                      </Button>
                    )}
                  </div>
                  {job && (
                    <details className="text-xs text-stone-500">
                      <summary className="cursor-pointer">prompt usado</summary>
                      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2">{job.prompt}</pre>
                    </details>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: ImageRow["status"] }) {
  if (status === "approved") return <Badge tone="green">aprovada</Badge>;
  if (status === "rejected") return <Badge tone="red">rejeitada</Badge>;
  return <Badge tone="orange">revisar</Badge>;
}

function JobCard({ job, onCancel, onRetry }: { job: JobRow; onCancel?: () => void; onRetry?: () => void }) {
  const lines = job.log.trim().split("\n").filter(Boolean);
  return (
    <Card className={`p-3 ${job.status === "failed" ? "border-red-200 bg-red-50/40" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {job.status === "running" && <Spinner className="size-4 text-orange-500" />}
        <span className="font-medium">{JOB_TYPE_LABEL[job.type as JobType] ?? job.type}</span>
        <span className="text-stone-400">{job.label}</span>
        <Badge tone={job.status === "failed" ? "red" : job.status === "running" ? "orange" : "stone"}>
          {{ queued: "na fila", running: "gerando", failed: "falhou" }[job.status as string] ?? job.status}
        </Badge>
        {job.status === "running" && (
          <span className="text-stone-500">
            <Elapsed since={job.started_at} />
          </span>
        )}
        <span className="ml-auto flex gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          {onRetry && <Button onClick={onRetry}>↻ Tentar de novo</Button>}
        </span>
      </div>
      {job.error && <p className="mt-1 text-sm text-red-700">{job.error}</p>}
      {lines.length > 0 && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-stone-900 p-2 text-xs leading-relaxed text-stone-200">
          {lines.slice(-15).join("\n")}
        </pre>
      )}
    </Card>
  );
}
