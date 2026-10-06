import { RotateCcw, ScanSearch, Trash2, X } from "lucide-react";
import { Button, Card, Disclosure, Elapsed, Icon, IconTile, Progress } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { JobRow } from "@/lib/db";
import type { JobType } from "@/lib/prompts";
import { MODE_UI } from "./modes";

const STATUS: Record<string, string> = { queued: "Na fila", failed: "Não deu certo" };

/** A queued, running or failed AI job, in plain words. The Codex log stays one click away. */
export function JobCard({ job, onCancel, onRetry, onDismiss }: { job: JobRow; onCancel?: () => void; onRetry?: () => void; onDismiss?: () => void }) {
  const mode = MODE_UI[job.type as JobType];
  const lines = job.log.trim().split("\n").filter(Boolean);
  const failed = job.status === "failed";
  const status = job.status === "running"
    ? job.type === "facts-assist" ? "Analisando fotos e informações…" : job.type === "listing" ? "Preparando anúncio…" : "Criando sua imagem…"
    : job.status === "queued" && job.type === "facts-assist" ? "Análise do produto na fila…"
    : STATUS[job.status] ?? job.status;
  return (
    <Card tone={failed ? "plain" : "surface"} className={cn("space-y-3 p-4", failed && "ring-danger/25")}>
      <div className="flex flex-wrap items-center gap-3">
          {mode ? (
            <IconTile icon={mode.icon} tone={failed ? "neutral" : mode.tone} size="sm" />
          ) : job.type === "facts-assist" ? (
            <IconTile icon={ScanSearch} tone={failed ? "neutral" : "sky"} size="sm" />
          ) : null}
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", failed ? "text-danger" : "text-ink-strong")}>
            {status}
            {job.status === "running" && (
              <span className="ml-2 font-normal text-ink-muted">
                <Elapsed since={job.started_at} />
              </span>
            )}
          </p>
          <p className="truncate text-xs text-ink-muted">{job.title ?? `${mode?.title ?? job.type} · ${job.label}`}</p>
          {job.model && <p className="text-[11px] text-ink-faint">Modelo: {job.model}</p>}
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <Icon icon={X} /> Cancelar
          </Button>
        )}
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            <Icon icon={RotateCcw} /> Tentar de novo
          </Button>
        )}
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} title="Remove este erro da lista; o histórico técnico continua salvo">
            <Icon icon={Trash2} /> Descartar
          </Button>
        )}
      </div>
      {!failed && <Progress />}
      {job.error && <p className="text-sm text-danger">{job.error}</p>}
      {lines.length > 0 && (
        <Disclosure summary="Ver o que a IA está fazendo" defaultOpen={job.type === "facts-assist" && !failed}>
          <pre className="max-h-44 overflow-auto rounded-xl bg-ink-strong p-3 font-mono text-[11px] leading-relaxed text-white/75">{lines.slice(-15).join("\n")}</pre>
        </Disclosure>
      )}
    </Card>
  );
}
