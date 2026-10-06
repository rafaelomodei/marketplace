import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db, now, type JobRow } from "./db";
import { runCodex } from "./engine/codex";
import { codexOutputSchema, parseCodexOutput } from "./engine/structured";
import { DATA_DIR } from "./paths";
import { HttpError, productFile, readMeta, requireProduct, writeMeta } from "./products";
import { getCodexSettings } from "./settings";
import { missingRequiredFacts, productFactsSchema, type ProductFacts } from "./product-facts";
export { productFactsSchema } from "./product-facts";
export type { ProductFacts } from "./product-facts";

export const listingOutputSchema = z.object({
  marketplace: z.literal("shopee"), title: z.string().trim().min(1).max(120), titleAlternatives: z.array(z.string().trim().min(1).max(120)).max(2), description: z.string().trim().min(1),
  suggestedCategory: z.object({ name: z.string().trim().min(1), rationale: z.string().trim().min(1) }), attributes: z.record(z.string(), z.string()).default({}), personalizationInstructions: z.string().trim().optional(),
  faq: z.array(z.object({ question: z.string().trim().min(1), answer: z.string().trim().min(1) })).default([]), pending: z.array(z.object({ question: z.string().trim().min(1), blocking: z.boolean().default(false) })).default([]),
});
export type ListingOutput = z.output<typeof listingOutputSchema>;
/** What Codex answers: strict mode has no free-form records, so attributes come as name/value pairs. */
export const listingCodexSchema = listingOutputSchema.extend({ attributes: z.array(z.object({ name: z.string().trim().min(1), value: z.string().trim().min(1) })).default([]) });
export type ListingRevision = ListingOutput & { id: string; createdAt: string; factsHash: string; promptVersion: string; rulesVersion: string; status: "draft" | "approved"; categoryConfirmed: boolean; manual: Partial<Pick<ListingOutput, "title" | "description" | "attributes" | "personalizationInstructions">> };
type ListingStore = { schemaVersion: 1; marketplace: "shopee"; revisions: ListingRevision[] };

const listingPath = (slug: string) => productFile(slug, "listings/shopee.json");
function atomicJson(file: string, data: unknown) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n"); fs.renameSync(tmp, file); }
function hash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function readFacts(slug: string): ProductFacts {
  const raw = (readMeta(slug) as any).facts ?? {};
  return productFactsSchema.parse({ ...raw, identification: { ...(raw.identification ?? {}), brand: "Verde Forma" } });
}
export function updateFacts(slug: string, facts: unknown) {
  const raw = facts as any;
  const parsed = productFactsSchema.parse({ ...raw, identification: { ...(raw?.identification ?? {}), brand: "Verde Forma" } });
  writeMeta(slug, { facts: parsed } as any);
  return parsed;
}
function store(slug: string): ListingStore { const file = listingPath(slug); if (!fs.existsSync(file)) return { schemaVersion: 1, marketplace: "shopee", revisions: [] }; return z.object({ schemaVersion: z.literal(1), marketplace: z.literal("shopee"), revisions: z.array(listingOutputSchema.extend({ id: z.string(), createdAt: z.string(), factsHash: z.string(), promptVersion: z.string(), rulesVersion: z.string(), status: z.enum(["draft", "approved"]), categoryConfirmed: z.boolean(), manual: z.object({ title: z.string().optional(), description: z.string().optional(), attributes: z.record(z.string(), z.string()).optional(), personalizationInstructions: z.string().optional() }).default({}) })) }).parse(JSON.parse(fs.readFileSync(file, "utf8"))); }
function saveStore(slug: string, value: ListingStore) { atomicJson(listingPath(slug), value); }
export function listingRevisions(slug: string) { return store(slug).revisions; }
export function currentFactsHash(slug: string) { return hash(readFacts(slug)); }
export function effectiveListing(r: ListingRevision) { return { ...r, ...r.manual, attributes: r.manual.attributes ?? r.attributes }; }

export function listingRequirements(slug: string) {
  const facts = readFacts(slug); const revisions = listingRevisions(slug); const current = revisions[0]; const effective = current && effectiveListing(current);
  const missing = missingRequiredFacts(facts).map((field) => field.label);
  const stale = !!current && current.factsHash !== currentFactsHash(slug);
  const hasExports = requireProduct(slug) && (db().prepare("SELECT COUNT(*) n FROM images WHERE product=? AND kind='export' AND rel LIKE 'exports/shopee/%'").get(slug) as { n: number }).n > 0;
  const blocking = [...missing, ...(effective?.pending.filter((p) => p.blocking).map((p) => p.question) ?? [])];
  return { missing, stale, hasExports, current: effective ?? null, ready: !!effective && current.status === "approved" && current.categoryConfirmed && !stale && hasExports && !blocking.length, blocking };
}

export function updateListing(slug: string, id: string, patch: { title?: string; description?: string; attributes?: Record<string, string>; personalizationInstructions?: string; categoryConfirmed?: boolean }) {
  const s = store(slug); const rev = s.revisions.find((x) => x.id === id); if (!rev) throw new HttpError(404, "Versão do anúncio não encontrada");
  const { categoryConfirmed, ...manual } = patch; rev.manual = { ...rev.manual, ...manual }; if (categoryConfirmed !== undefined) rev.categoryConfirmed = categoryConfirmed; saveStore(slug, s); return effectiveListing(rev);
}
export function approveListing(slug: string, id: string) { const s = store(slug); const rev = s.revisions.find((x) => x.id === id); if (!rev) throw new HttpError(404, "Versão do anúncio não encontrada"); const req = listingRequirements(slug); if (req.stale || !rev.categoryConfirmed || req.blocking.length) throw new HttpError(400, "O anúncio ainda precisa de revisão: " + [...req.blocking, ...(req.stale ? ["ficha alterada"] : []), ...(!rev.categoryConfirmed ? ["confirme a categoria"] : [])].join(", ")); rev.status = "approved"; saveStore(slug, s); return effectiveListing(rev); }

const PROMPT_VERSION = "shopee-v1";
export function listingPrompt(facts: ProductFacts, notes: string) { return `Você prepara um anúncio manual para Shopee de produto impresso em 3D. Responda SOMENTE o JSON do schema.\nFATOS (fonte da verdade):\n${JSON.stringify(facts)}\nNOTAS DO VENDEDOR (não são fatos confirmados): ${notes}\n\nRegras: use somente fatos confirmados. Fotos podem contextualizar aparência e finalidade, mas não comprovam medidas, peso, material, estoque, conteúdo ou segurança. Nunca invente acessórios, garantias, certificações, origem, resistência, contato alimentar, prazo ou disponibilidade. Não use placeholders na descrição. Dados ausentes viram perguntas objetivas em pending; marque blocking quando impede cadastro. Estruture descrição em apresentação/finalidade, diferenciais confirmados, conteúdo, medidas-material-acabamento, variações-personalização, uso-cuidados e observações. Categoria é sugestão editorial pela função, sem ID oficial; não alegue requisito da Shopee. Evite repetição e exageros.`; }
export function createListingJob(slug: string) { requireProduct(slug); const id = `listing-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`; const prompt = listingPrompt(readFacts(slug), readMeta(slug).description); const title = `${readMeta(slug).name} · Anúncio Shopee`; db().prepare("INSERT INTO jobs (id,product,type,label,params,prompt,status,created_at,model,title) VALUES (?,?,?,?,?,?, 'queued',?,?,?)").run(id, slug, "listing", "Anúncio Shopee", JSON.stringify({ marketplace: "shopee", factsHash: currentFactsHash(slug) }), prompt, now(), getCodexSettings().model, title); return id; }
export async function executeListingJob(job: JobRow, ctrl: AbortController, log: (line: string) => void, setThread: (id: string) => void) {
  const workdir = path.join(DATA_DIR, "jobs", job.id); fs.mkdirSync(workdir, { recursive: true }); const schemaFile = path.join(workdir, "listing-schema.json");
  atomicJson(schemaFile, codexOutputSchema(listingCodexSchema));
  const refs = db().prepare("SELECT rel FROM images WHERE product=? AND kind IN ('approved','real') ORDER BY kind='approved' DESC, created_at DESC LIMIT 4").all(job.product) as { rel: string }[];
  const result = await runCodex({ workdir, prompt: job.prompt, images: refs.map((x) => productFile(job.product, x.rel)), outputSchema: schemaFile, model: job.model ?? getCodexSettings().model, title: job.title ?? `${readMeta(job.product).name} · Anúncio Shopee`, signal: ctrl.signal, onLog: log, onThread: setThread });
  let parsed: ListingOutput; try { const raw = parseCodexOutput(listingCodexSchema, result.lastMessage); parsed = { ...raw, attributes: Object.fromEntries(raw.attributes.map((item) => [item.name, item.value])) }; } catch (e) { throw new Error(`Saída estruturada inválida do Codex: ${e instanceof Error ? e.message : String(e)}`); }
  const params = JSON.parse(job.params) as { factsHash: string }; const rev: ListingRevision = { ...parsed, id: crypto.randomUUID(), createdAt: now(), factsHash: params.factsHash, promptVersion: PROMPT_VERSION, rulesVersion: "shopee-rules-unverified-2026-10-05", status: "draft", categoryConfirmed: false, manual: {} };
  const s = store(job.product); s.revisions.unshift(rev); saveStore(job.product, s); return rev;
}
export function exportListing(slug: string, id: string) { const rev = listingRevisions(slug).find((x) => x.id === id); if (!rev) throw new HttpError(404, "Versão do anúncio não encontrada"); const value = effectiveListing(rev); const dir = productFile(slug, "exports/shopee/listing"); fs.mkdirSync(dir, { recursive: true }); const safe = id.replace(/[^a-zA-Z0-9-]/g, ""); fs.writeFileSync(path.join(dir, `${safe}.txt`), `${value.title}\n\n${value.description}\n`); atomicJson(path.join(dir, `${safe}.json`), value); return { txt: `exports/shopee/listing/${safe}.txt`, json: `exports/shopee/listing/${safe}.json` }; }
