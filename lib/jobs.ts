import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { filamentRefFiles, findFilament, generationSkill } from "./config";
import { db, now, type JobRow } from "./db";
import { runCodex } from "./engine/codex";
import { DATA_DIR, ROOT, SUBDIRS } from "./paths";
import { buildPrompt, jobInputIds, normalizeParams, type Aspect, type JobParams } from "./prompts";
import { getImage, HttpError, imagePath, readMeta, registerImage, requireProduct } from "./products";
import { createListingJob, executeListingJob } from "./listing";
import { getCodexSettings } from "./settings";
import { createFactsAssistJob, executeFactsAssistJob } from "./facts-assistant";

const CONCURRENCY = Math.max(1, Number(process.env.STUDIO_CONCURRENCY ?? 1));
const MAX_BATCH = 12;

type QueueState = { started: boolean; running: Map<string, AbortController> };
const g = globalThis as unknown as { __studioQueue?: QueueState };
const state: QueueState = (g.__studioQueue ??= { started: false, running: new Map() });

/**
 * What callers ask for. Recolor: each part may list several filaments, one job per combination.
 */
export type JobRequest = Exclude<JobParams, { type: "recolor" }> | { type: "recolor"; sourceImageId: number; colors: { part: string; filamentIds: string[] }[]; extra?: string };

export function expandRequest(req: JobRequest): JobParams[] {
  if (req.type !== "recolor") return [req];
  const rows = req.colors.filter((c) => c.filamentIds.length > 0);
  if (!rows.length) throw new HttpError(400, "Escolha ao menos um filamento");
  let combos: { part: string; filamentId: string }[][] = [[]];
  for (const row of rows)
    combos = combos.flatMap((combo) => row.filamentIds.map((filamentId) => [...combo, { part: row.part, filamentId }]));
  if (combos.length > MAX_BATCH) throw new HttpError(400, `Isso geraria ${combos.length} imagens (máximo ${MAX_BATCH})`);
  return combos.map((colors) => ({ type: "recolor", sourceImageId: req.sourceImageId, colors, extra: req.extra }));
}

function validate(product: string, p: JobParams) {
  if (p.type === "scene" && !p.sceneImageId) throw new HttpError(400, "Selecione a imagem de cenário");
  if (p.type === "staged" && !p.setting.trim()) throw new HttpError(400, "Descreva a cena");
  const ids = jobInputIds(p);
  if (!ids.length) throw new HttpError(400, "Selecione ao menos uma imagem do produto");
  if (p.type === "scene" && !p.productImageIds.length) throw new HttpError(400, "Selecione ao menos uma foto do produto");
  for (const id of ids) {
    const image = getImage(id);
    if (image.product !== product) throw new HttpError(400, `Imagem ${id} é de outro produto`);
    if (p.type === "correct") {
      if (id === p.sourceImageId) {
        if (image.kind !== "generated") throw new HttpError(400, "A versão a corrigir precisa ser uma imagem gerada");
      } else if (!(["real", "style", "approved", "generated"] as string[]).includes(image.kind) || (image.kind === "generated" && image.status === "rejected")) {
        throw new HttpError(400, "Referência inválida para a correção");
      }
      continue;
    }
    if (p.type === "scene" && id === p.sceneImageId) {
      if (image.kind !== "style") throw new HttpError(400, "A imagem de cenário precisa ser uma referência de cenário");
      continue;
    }
    const usableReference = image.kind === "real" || image.kind === "approved" || (image.kind === "generated" && image.status !== "rejected");
    if (!usableReference) throw new HttpError(400, "Escolha uma foto do produto ou uma imagem gerada que não tenha sido descartada");
  }
}

export function createJobs(product: string, req: JobRequest): string[] {
  return enqueue(product, expandRequest(req));
}

function enqueue(product: string, jobs: JobParams[]): string[] {
  requireProduct(product);
  const skill = generationSkill();
  const settings = getCodexSettings();
  const ids: string[] = [];
  for (const job of jobs) {
    const params = withFilamentRefs(job);
    validate(product, params);
    const { prompt, label } = buildPrompt(params, { meta: readMeta(product), filament: findFilament, skill });
    const id = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
    db()
      .prepare(
        `INSERT INTO jobs (id, product, type, label, params, prompt, status, created_at, model, title) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
      )
      .run(id, product, params.type, label, JSON.stringify(params), prompt, now(), settings.model, `${readMeta(product).name} · ${label}`);
    ids.push(id);
  }
  tick();
  return ids;
}

/**
 * Attaches the local photos of each filament (in order) so Codex sees the real color and finish.
 */
function withFilamentRefs(p: JobParams): JobParams {
  const refsOf = (ids: string[], perFilament?: number) =>
    [...new Set(ids)].map((filamentId) => {
      const f = findFilament(filamentId);
      return { filamentId, files: (f ? filamentRefFiles(f) : []).slice(0, perFilament) };
    });
  if (p.type === "recolor") return { ...p, refs: refsOf(p.colors.map((c) => c.filamentId)) };
  return p;
}

/** Absolute paths of everything attached to Codex, in prompt order. */
function jobInputPaths(p: JobParams): string[] {
  const images = jobInputIds(p).map((id) => imagePath(getImage(id)));
  const refs = p.type === "recolor" ? (p.refs ?? []).flatMap((r) => r.files.map((f) => path.join(ROOT, f))) : [];
  return [...images, ...refs];
}

export function getJob(id: string): JobRow {
  const job = db().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  if (!job) throw new HttpError(404, `Job ${id} não encontrado`);
  return job;
}

export function cancelJob(id: string) {
  const job = getJob(id);
  if (job.status === "queued")
    db().prepare("UPDATE jobs SET status = 'canceled', finished_at = ? WHERE id = ?").run(now(), id);
  else if (job.status === "running") state.running.get(id)?.abort();
}

/** Hides a terminal failed/canceled job from the seller without deleting its diagnostic log. */
export function dismissJob(id: string) {
  const job = getJob(id);
  if (job.status !== "failed" && job.status !== "canceled") throw new HttpError(400, "Só é possível descartar jobs com falha ou cancelados");
  db().prepare("UPDATE jobs SET status = 'dismissed', finished_at = ? WHERE id = ?").run(now(), id);
}

/** Re-runs a job with the same parameters (a new job, so the old candidate stays for comparison). */
export function retryJob(id: string): string[] {
  const job = getJob(id);
  if (job.type === "listing") return [createListingJob(job.product)];
  if (job.type === "facts-assist") {
    const params = JSON.parse(job.params) as { sellerPrompt?: string; imageIds?: number[] };
    return [createFactsAssistJob(job.product, params.sellerPrompt ?? "", params.imageIds).jobId];
  }
  return enqueue(job.product, [normalizeParams(JSON.parse(job.params))]);
}

/** Creates a corrected revision while retaining product and scenario inputs from the original job. */
export function correctImage(imageId: number, correction: string): string[] {
  const image = getImage(imageId);
  if (image.kind !== "generated" || !image.job_id) throw new HttpError(400, "Escolha uma imagem gerada para corrigir");
  const original = getJob(image.job_id);
  if (original.type === "listing") throw new HttpError(400, "Este resultado não é uma imagem");
  const previous = normalizeParams(JSON.parse(original.params));
  const references = jobInputIds(previous).filter((id) => id !== imageId);
  const aspect = "aspect" in previous ? previous.aspect : "1:1";
  return enqueue(image.product, [{ type: "correct", sourceImageId: imageId, referenceImageIds: references, correction: correction.trim(), aspect }]);
}

/** Queues an AI reframe of an approved image to a new aspect. */
export function reframe(imageId: number, aspect: Aspect): string[] {
  const img = getImage(imageId);
  return createJobs(img.product, { type: "reframe", sourceImageId: imageId, aspect });
}

const appendLog = (id: string, line: string) =>
  db().prepare("UPDATE jobs SET log = log || ? WHERE id = ?").run(`${new Date().toLocaleTimeString("pt-BR")} ${line}\n`, id);

async function execute(job: JobRow, ctrl: AbortController) {
  const d = db();
  d.prepare("UPDATE jobs SET status = 'running', started_at = ?, error = NULL WHERE id = ?").run(now(), job.id);
  try {
    if (job.type === "facts-assist") {
      await executeFactsAssistJob(job, ctrl.signal, (line) => appendLog(job.id, line), (threadId) => d.prepare("UPDATE jobs SET thread_id = ? WHERE id = ?").run(threadId, job.id));
      d.prepare("UPDATE jobs SET status = 'done', finished_at = ? WHERE id = ?").run(now(), job.id);
      appendLog(job.id, "sugestões da ficha salvas para revisão");
      return;
    }
    if (job.type === "listing") {
      await executeListingJob(job, ctrl, (line) => appendLog(job.id, line), (threadId) => d.prepare("UPDATE jobs SET thread_id = ? WHERE id = ?").run(threadId, job.id));
      d.prepare("UPDATE jobs SET status = 'done', finished_at = ? WHERE id = ?").run(now(), job.id);
      appendLog(job.id, "anúncio salvo como nova versão");
      return;
    }
    const params = normalizeParams(JSON.parse(job.params));
    const inputs = jobInputPaths(params);
    appendLog(job.id, `iniciando codex com ${inputs.length} imagem(ns) de entrada`);
    const workdir = path.join(DATA_DIR, "jobs", job.id);
    const { outputPath } = await runCodex({
      workdir,
      prompt: job.prompt,
      images: inputs,
      model: job.model ?? getCodexSettings().model,
      title: job.title ?? `${readMeta(job.product).name} · ${job.label}`,
      signal: ctrl.signal,
      onLog: (line) => appendLog(job.id, line),
      onThread: (threadId) => d.prepare("UPDATE jobs SET thread_id = ? WHERE id = ?").run(threadId, job.id),
    });

    const { dir } = requireProduct(job.product);
    const rel = path.posix.join(SUBDIRS.generated, `${job.id}${path.extname(outputPath) || ".png"}`);
    fs.mkdirSync(path.join(dir, SUBDIRS.generated), { recursive: true });
    fs.copyFileSync(outputPath, path.join(dir, rel));
    const parentId = "sourceImageId" in params ? params.sourceImageId : null;
    const imageId = registerImage(job.product, rel, "generated", { label: job.label, jobId: job.id, parentId });
    d.prepare("UPDATE jobs SET status = 'done', output_image_id = ?, finished_at = ? WHERE id = ?").run(imageId, now(), job.id);
    appendLog(job.id, `imagem salva em ${rel}`);
  } catch (err) {
    const canceled = ctrl.signal.aborted;
    const message = err instanceof Error ? err.message : String(err);
    d.prepare("UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?").run(
      canceled ? "canceled" : "failed",
      message,
      now(),
      job.id,
    );
    appendLog(job.id, `✗ ${message}`);
  } finally {
    state.running.delete(job.id);
  }
}

function tick() {
  while (state.running.size < CONCURRENCY) {
    const next = db()
      .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1")
      .get() as JobRow | undefined;
    if (!next) return;
    // Mark synchronously so the loop doesn't pick the same job twice.
    const ctrl = new AbortController();
    state.running.set(next.id, ctrl);
    db().prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(next.id);
    void execute(next, ctrl).finally(tick);
  }
}

/** Starts the worker once per process; jobs interrupted by a restart go back to the queue. */
export function ensureWorker() {
  // Actions that insert a non-image job call this after the insert. Keep the queue moving
  // even when the worker was already initialized by an earlier request.
  if (state.started) {
    tick();
    return;
  }
  state.started = true;
  const requeued = db()
    .prepare("UPDATE jobs SET status = 'queued', log = log || ? WHERE status = 'running'")
    .run(`${new Date().toLocaleTimeString("pt-BR")} servidor reiniciado — job voltou para a fila\n`);
  if (requeued.changes) console.log(`[studio] ${requeued.changes} job(s) reenfileirado(s)`);
  tick();
}
