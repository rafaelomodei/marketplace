"use client";

import { Check, Save, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { JobCard } from "@/components/studio";
import { Button, Card, Disclosure, Field, fieldStatusClass, FormSection, Icon, ImageTile, InfoTip, Input, Spinner, Swatch, Textarea, type FieldStatus } from "@/components/ui";
import { api, fileUrl, reportError } from "@/lib/client/api";
import type { JobRow } from "@/lib/db";
import { REQUIRED_FACT_KEYS } from "@/lib/product-facts";
import { filamentHex } from "@/lib/prompts";
import type { FactsAssistRecord, FactsAssistResult } from "@/lib/facts-assistant";
import { stripEmpty } from "@/lib/engine/structured";
import type { StepProps } from "./shared";

type FormFacts = Record<string, any>;
type FieldPath = (typeof REQUIRED_FACT_KEYS)[number];
const val = (value: unknown) => value === undefined || value === null ? "" : String(value).replace(".", ",");
const splitList = (value: string) => value.split(/[;\n]/).map((item) => item.trim()).filter(Boolean);
const includedText = (items?: { name: string; quantity: number }[]) => items?.map((item) => `${item.name}: ${item.quantity}`).join("\n") ?? "";
/** Plain names for the summary of what the AI filled and what is still missing. */
const FIELD_LABELS: Record<string, string> = {
  "identification.internalName": "nome interno", "identification.family": "família", "identification.itemType": "tipo do item", "identification.sku": "SKU",
  "identification.material": "material", "identification.finish": "acabamento", "identification.colors": "combinações de cores", "identification.dimensions": "medidas do produto",
  "purchase.pieces": "quantidade de peças", "purchase.included": "itens inclusos", "purchase.notIncluded": "acessórios não inclusos", "purchase.assembly": "montagem",
  "personalization.accepted": "personalização", "personalization.fieldsText": "o que pode ser personalizado", "personalization.optionsAndLimits": "opções e limites", "personalization.buyerInstructions": "como o comprador envia os dados",
  "sale.priceBRL": "preço", "sale.stock": "estoque ou forma de atendimento", "sale.fulfillment": "forma de atendimento", "sale.preparationDays": "prazo de preparação", "sale.productionCapacity": "capacidade de produção",
  "shipping.grossWeight": "peso do pacote", "shipping.packageDimensions": "dimensões da embalagem",
  "care.purpose": "finalidade de uso", "care.cleaning": "limpeza e conservação", "care.limitations": "limitações", "care.printedFinishNotes": "observações do acabamento",
};
const isEmpty = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim());
const decimalValue = (value: string) => value.trim() ? Number(value.trim().includes(",") ? value.trim().replace(/\./g, "").replace(",", ".") : value.trim()) : undefined;

const priceText = (value: unknown) => typeof value === "number" ? value.toFixed(2).replace(".", ",") : val(value);
const num = (value: unknown) => isEmpty(value) ? undefined : decimalValue(String(value));
/** "Vela: 4" → 4 velas; a line without quantity counts as one item. */
const parseIncluded = (text: unknown) => splitList(String(text ?? "")).map((line) => {
  const match = line.match(/^(.*?):\s*(\d+)$/);
  return match && match[1].trim() ? { name: match[1].trim(), quantity: Number(match[2]) } : { name: line, quantity: 1 };
});

/** Saved facts → editable form (text inputs hold strings with a decimal comma). */
function formFromFacts(existing: FormFacts | undefined, productName: string): { f: FormFacts; combinationText: string } {
  return { combinationText: existing?.identification?.colors?.join("\n") ?? "", f: {
    schemaVersion: 1,
    identification: {
      internalName: productName, brand: "Verde Forma", ...existing?.identification,
      filamentIds: existing?.identification?.filamentIds ?? [],
      height: existing?.identification?.dimensions?.height, width: existing?.identification?.dimensions?.width, length: existing?.identification?.dimensions?.length, unit: existing?.identification?.dimensions?.unit ?? "mm",
    },
    purchase: { ...existing?.purchase, includedText: includedText(existing?.purchase?.included), notIncludedText: existing?.purchase?.notIncluded?.join("; ") },
    personalization: { ...existing?.personalization, fieldsText: existing?.personalization?.fields?.join("; ") },
    sale: { ...existing?.sale, priceBRL: priceText(existing?.sale?.priceBRL) },
    shipping: {
      grossValue: val(existing?.shipping?.grossWeight?.value), grossUnit: existing?.shipping?.grossWeight?.unit ?? "g",
      packageHeight: val(existing?.shipping?.packageDimensions?.height), packageWidth: val(existing?.shipping?.packageDimensions?.width), packageLength: val(existing?.shipping?.packageDimensions?.length), packageUnit: existing?.shipping?.packageDimensions?.unit ?? "cm",
    },
    care: { ...existing?.care },
    variations: existing?.variations,
  } };
}

/** Editable form → facts payload. Empty inputs become absent, so an incomplete ficha still saves. */
function factsFromForm(f: FormFacts, combinationText: string, selectedNames: string[]) {
  let variations = f.variations;
  if (typeof variations === "string") {
    if (!variations.trim()) variations = undefined;
    else try { variations = JSON.parse(variations); } catch { throw new Error("Variações comerciais: o texto não está no formato esperado (JSON)."); }
  }
  const colors = splitList(combinationText);
  const sides = (source: FormFacts, keys: [string, string, string], unit: string) => keys.some((key) => !isEmpty(source?.[key]))
    ? { height: num(source[keys[0]]), width: num(source[keys[1]]), length: num(source[keys[2]]), unit } : undefined;
  const { height: _h, width: _w, length: _l, unit, ...identification } = f.identification ?? {};
  const { includedText: _i, notIncludedText, ...purchase } = f.purchase ?? {};
  const { fieldsText, ...personalization } = f.personalization ?? {};
  return stripEmpty({
    schemaVersion: 1,
    identification: { ...identification, brand: "Verde Forma", colors: colors.length ? colors : selectedNames, dimensions: sides(f.identification, ["height", "width", "length"], unit || "mm") },
    purchase: { ...purchase, pieces: num(purchase.pieces), included: parseIncluded(f.purchase?.includedText), notIncluded: splitList(notIncludedText ?? "") },
    personalization: { ...personalization, fields: splitList(fieldsText ?? "") },
    sale: { ...f.sale, priceBRL: num(f.sale?.priceBRL), stock: num(f.sale?.stock), preparationDays: num(f.sale?.preparationDays), productionCapacity: num(f.sale?.productionCapacity) },
    shipping: {
      grossWeight: isEmpty(f.shipping?.grossValue) ? undefined : { value: num(f.shipping.grossValue), unit: f.shipping.grossUnit || "g" },
      packageDimensions: sides(f.shipping, ["packageHeight", "packageWidth", "packageLength"], f.shipping?.packageUnit || "cm"),
    },
    care: f.care,
    variations,
  }) as FormFacts;
}
/** Stable text of a payload, used to tell whether the form differs from what is saved. */
const fingerprint = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const hasInvalidNumber = (value: unknown): boolean => typeof value === "number" ? !Number.isFinite(value) : !!value && typeof value === "object" && Object.values(value).some(hasInvalidNumber);
const draftKey = (slug: string) => `studio:facts-draft:${slug}`;
type Draft = { base: string; f: FormFacts; combinationText: string; aiFilled: string[] };

export function InfoStep({ product, config, reload }: StepProps) {
  const [initial] = useState(() => formFromFacts(product.meta.facts as FormFacts | undefined, product.meta.name));
  const [f, setF] = useState<FormFacts>(initial.f);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [assistJobId, setAssistJobId] = useState<string | null>(null);
  const [assistLoaded, setAssistLoaded] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FactsAssistResult["questions"]>([]);
  const [colorSearch, setColorSearch] = useState("");
  const [combinationText, setCombinationText] = useState(initial.combinationText);
  const [selectedImageIds, setSelectedImageIds] = useState<number[] | null>(null);
  /** Form keys the last AI suggestion filled; cleared on save, when the seller has reviewed them. */
  const [aiFilled, setAiFilled] = useState<string[]>([]);
  const pickedFromHistory = useRef(false);
  const formRef = useRef({ f, combinationText });
  formRef.current = { f, combinationText };

  const set = (group: string, key: string, value: unknown) => setF((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  const setTop = (key: string, value: unknown) => setF((current) => ({ ...current, [key]: value }));
  const selectedFilaments: string[] = f.identification?.filamentIds ?? [];
  const selectedNames = useMemo(() => selectedFilaments.map((id) => config.filaments.filaments.find((item) => item.id === id)).filter(Boolean).map((item) => `${item!.name} (${item!.line})`), [config.filaments.filaments, selectedFilaments]);
  const currentFacts = useMemo(() => { try { return factsFromForm(f, combinationText, selectedNames); } catch { return null; } }, [combinationText, f, selectedNames]);
  /** Fingerprint of the saved ficha; the save button only turns on when the form differs from it. */
  const [saved, setSaved] = useState(() => fingerprint(currentFacts));
  const dirty = !currentFacts || fingerprint(currentFacts) !== saved;

  // Unsaved edits survive switching steps or pages: keep a draft in this browser until saved.
  const draftRestored = useRef(false);
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey(product.slug)) ?? "null") as Draft | null;
      // A draft made on top of an older ficha (saved elsewhere since then) is discarded.
      if (draft?.base === saved) { setF(draft.f); setCombinationText(draft.combinationText); setAiFilled(draft.aiFilled ?? []); }
    } catch { /* storage unavailable: just start from the saved ficha */ }
    draftRestored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.slug]);
  useEffect(() => {
    if (!draftRestored.current) return;
    try {
      if (dirty) localStorage.setItem(draftKey(product.slug), JSON.stringify({ base: saved, f, combinationText, aiFilled } satisfies Draft));
      else localStorage.removeItem(draftKey(product.slug));
    } catch { /* ignore */ }
  }, [aiFilled, combinationText, dirty, f, product.slug, saved]);

  const jobsById = useMemo(() => new Map(product.jobs.map((job) => [job.id, job])), [product.jobs]);
  const analysisImages = useMemo(() => product.images
    .filter((image) => image.kind === "real" || image.kind === "approved")
    .sort((a, b) => {
      const score = (image: typeof a) => image.kind === "approved" && jobsById.get(image.job_id ?? "")?.type === "white-bg" ? 0 : image.kind === "approved" ? 1 : 2;
      return score(a) - score(b) || b.created_at.localeCompare(a.created_at) || b.id - a.id;
    }), [jobsById, product.images]);
  const defaultImageIds = useMemo(() => analysisImages.slice(0, 1).map((image) => image.id), [analysisImages]);
  const imagesToAnalyze = selectedImageIds ?? defaultImageIds;
  const activeAssist = assistJobId ? product.jobs.find((job) => job.id === assistJobId) : undefined;
  const latestAssist = activeAssist ?? product.jobs.find((job) => job.type === "facts-assist");
  const assistInProgress = !!latestAssist && ["queued", "running"].includes(latestAssist.status);
  const missing = new Set<FieldPath>();
  if (!String(f.identification?.itemType ?? "").trim()) missing.add("identification.itemType");
  if (!String(f.identification?.material ?? "").trim()) missing.add("identification.material");
  const includedLines = splitList(String(f.purchase?.includedText ?? ""));
  if (!includedLines.length) missing.add("purchase.included");
  const price = decimalValue(String(f.sale?.priceBRL ?? ""));
  if (!price || price <= 0) missing.add("sale.priceBRL");
  const stock = f.sale?.stock === undefined || f.sale?.stock === "" ? undefined : Number(f.sale.stock);
  if ((stock === undefined || !Number.isInteger(stock) || stock < 0) && f.sale?.fulfillment !== "made_to_order") missing.add("sale.stock");
  if (!decimalValue(String(f.shipping?.grossValue ?? ""))) missing.add("shipping.grossWeight");
  if (![f.shipping?.packageHeight, f.shipping?.packageWidth, f.shipping?.packageLength].some((value) => (decimalValue(String(value ?? "")) ?? 0) > 0)) missing.add("shipping.packageDimensions");

  async function save() {
    setBusy(true);
    try {
      const facts = factsFromForm(f, combinationText, selectedNames);
      if (hasInvalidNumber(facts)) throw new Error("Há um número inválido na ficha. Use só números, por exemplo 29,90.");
      const stored = await api<FormFacts>("/api/actions/update_product_facts", { method: "POST", json: { slug: product.slug, facts } });
      // Show exactly what was stored, so the form and the saved ficha match again.
      const next = formFromFacts(stored, product.meta.name);
      setF(next.f); setCombinationText(next.combinationText); setAiFilled([]);
      setSaved(fingerprint(factsFromForm(next.f, next.combinationText, selectedNames)));
      await reload();
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  }

  async function assist() {
    setBusy(true);
    try {
      const result = await api<{ jobId: string }>("/api/actions/suggest_product_facts", { method: "POST", json: { slug: product.slug, prompt, imageIds: imagesToAnalyze } });
      pickedFromHistory.current = false;
      setAssistJobId(result.jobId); setAssistLoaded(null); setQuestions([]); setAiFilled([]); await reload();
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  }

  async function cancelAssist(job: JobRow) {
    try { await api(`/api/jobs/${job.id}`, { method: "POST", json: { action: "cancel" } }); await reload(); }
    catch (error) { reportError(error); }
  }

  useEffect(() => {
    if (!assistJobId || activeAssist?.status !== "done" || assistLoaded === assistJobId) return;
    setAssistLoaded(assistJobId);
    api<FactsAssistRecord>("/api/actions/get_product_facts_suggestions", { method: "POST", json: { slug: product.slug, jobId: assistJobId } }).then((result) => {
      // A finished job found on page load was already reviewed if the ficha was saved after it ran.
      if (pickedFromHistory.current && !result.fresh) return;
      setQuestions(result.questions);
      const { f: current, combinationText: currentCombination } = formRef.current;
      const next = structuredClone(current);
      const filled: string[] = [];
      const fill = (group: string, key: string, value: unknown, mark = `${group}.${key}`) => {
        next[group] ??= {};
        if (isEmpty(value) || !isEmpty(next[group][key])) return false;
        next[group][key] = value;
        if (!filled.includes(mark)) filled.push(mark);
        return true;
      };
      for (const [group, values] of Object.entries(result.facts as FormFacts)) {
        for (const [key, value] of Object.entries(values as FormFacts)) {
          if (group === "identification" && key === "colors") {
            if (!currentCombination.trim() && (value as string[]).length) { setCombinationText((value as string[]).join("\n")); filled.push("identification.colors"); }
          } else if (group === "identification" && key === "dimensions") {
            const dimensions = value as FormFacts;
            const any = ["height", "width", "length"].map((side) => fill("identification", side, dimensions[side], "identification.dimensions")).some(Boolean);
            if (any) next.identification.unit = dimensions.unit;
          } else if (key === "included") fill("purchase", "includedText", includedText(value as { name: string; quantity: number }[]), "purchase.included");
          else if (key === "notIncluded") fill("purchase", "notIncludedText", (value as string[]).join("; "), "purchase.notIncluded");
          else if (key === "fields") fill("personalization", "fieldsText", (value as string[]).join("; "), "personalization.fieldsText");
          else if (group === "shipping" && key === "grossWeight") {
            const weight = value as { value: number; unit: "g" | "kg" };
            if (fill("shipping", "grossValue", val(weight.value), "shipping.grossWeight")) next.shipping.grossUnit = weight.unit;
          } else if (group === "shipping" && key === "packageDimensions") {
            const dimensions = value as FormFacts;
            const any = [["packageHeight", "height"], ["packageWidth", "width"], ["packageLength", "length"]].map(([target, source]) => fill("shipping", target, dimensions[source] === undefined ? undefined : val(dimensions[source]), "shipping.packageDimensions")).some(Boolean);
            if (any) next.shipping.packageUnit = dimensions.unit;
          } else fill(group, key, group === "sale" && key === "priceBRL" ? val(value) : value);
        }
      }
      setF(next);
      setAiFilled((previous) => [...new Set([...previous, ...filled])]);
    }).catch(reportError);
  }, [activeAssist?.status, assistJobId, assistLoaded, product.slug]);

  /** Missing required data wins over the AI marker: it is what blocks the seller. */
  const statusOf = (formKey: string, requiredPath?: FieldPath): FieldStatus | undefined =>
    requiredPath && missing.has(requiredPath) ? "missing" : aiFilled.includes(formKey) ? "suggested" : undefined;
  const input = (group: string, key: string, label: string, options: { requiredPath?: FieldPath; hint?: string; type?: string; help?: string } = {}) => {
    const required = !!options.requiredPath && REQUIRED_FACT_KEYS.includes(options.requiredPath) && !(options.requiredPath === "sale.stock" && f.sale?.fulfillment === "made_to_order");
    const status = statusOf(`${group}.${key}`, options.requiredPath);
    return <Field key={`${group}.${key}`} label={label} hint={options.hint ?? options.help} required={required} status={status}>
      <Input type={options.type ?? "text"} inputMode={options.type === "number" ? "decimal" : undefined} value={val(f[group]?.[key])} aria-invalid={status === "missing"} className={status ? fieldStatusClass[status] : undefined} onChange={(event) => set(group, key, event.target.value)} />
    </Field>;
  };
  const statusClass = (status?: FieldStatus) => status ? fieldStatusClass[status] : undefined;
  const selectClass = "h-11 w-full rounded-xl bg-canvas px-3.5 text-sm text-ink-strong ring-1 ring-line-strong ring-inset";
  const listColors = config.filaments.filaments.filter((filament) => `${filament.name} ${filament.line} ${filament.id}`.toLocaleLowerCase("pt-BR").includes(colorSearch.toLocaleLowerCase("pt-BR")));

  useEffect(() => {
    if (!assistJobId && latestAssist?.type === "facts-assist" && latestAssist.status === "done") { pickedFromHistory.current = true; setAssistJobId(latestAssist.id); }
  }, [assistJobId, latestAssist?.id, latestAssist?.status, latestAssist?.type]);

  return <div className="space-y-9">
    {assistInProgress && (
      <JobCard
        job={latestAssist}
        onCancel={() => cancelAssist(latestAssist)}
      />
    )}
    <Card tone="surface" className="space-y-4 p-5">
      <div className="space-y-1"><h2 className="flex items-center gap-2 text-lg tracking-[-0.02em] text-ink-strong"><Icon icon={Sparkles} className="size-4"/> Preencher com inteligência artificial</h2><p className="text-sm text-ink-muted">Conte o que sabe sobre o produto. O Codex também analisa fotos reais e aprovadas para sugerir tipo e finalidade visual.</p></div>
      <Field label="Descrição ou instruções para preencher a ficha" optional hint="O que não estiver claro ficará vazio e aparecerá como pendência. As sugestões só ocupam campos vazios."><Textarea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ex.: porta-guardanapos para mesa posta; acompanha um suporte impresso. Feito em PLA branco e rosa. Não aceita personalização." /></Field>
      {analysisImages.length > 0 && <Disclosure defaultOpen summary={<span className="font-medium text-ink-strong">Fotos para analisar <span className="font-normal text-ink-muted">· {imagesToAnalyze.length} de {analysisImages.length} selecionada{imagesToAnalyze.length === 1 ? "" : "s"}</span></span>}>
        <p className="mb-3 text-xs text-ink-muted">A foto de fundo branco já vem marcada. Toque para escolher até 4 fotos com outros ângulos.</p>
        <div className="flex flex-wrap gap-2">{analysisImages.map((image) => {
        const recommended = image.kind === "approved" && jobsById.get(image.job_id ?? "")?.type === "white-bg";
        const selected = imagesToAnalyze.includes(image.id);
        return <ImageTile key={image.id} className="w-20" alt={recommended ? "Fundo branco (recomendada)" : image.kind === "approved" ? "Imagem aprovada" : "Foto real"} src={fileUrl(product.slug, image.rel, 160)} selected={selected} onSelect={() => {
          if (assistInProgress) return;
          if (selected) return setSelectedImageIds(imagesToAnalyze.filter((id) => id !== image.id));
          if (imagesToAnalyze.length >= 4) return reportError(new Error("Escolha no máximo 4 fotos para analisar"));
          setSelectedImageIds([...imagesToAnalyze, image.id]);
        }} caption={recommended ? "Recomendada" : undefined} />;
      })}</div></Disclosure>}
      <div className="flex flex-wrap items-center gap-3"><Button variant="primary" disabled={busy || latestAssist?.status === "queued" || latestAssist?.status === "running"} onClick={assist}>{busy ? <Spinner/> : <Icon icon={Sparkles}/>} Preencher campos vazios</Button><span className="text-xs text-ink-muted">{imagesToAnalyze.length ? `${imagesToAnalyze.length} foto${imagesToAnalyze.length === 1 ? "" : "s"} será${imagesToAnalyze.length === 1 ? "" : "ão"} analisada${imagesToAnalyze.length === 1 ? "" : "s"}.` : "Use a descrição acima ou escolha uma foto para analisar."}</span></div>
      {latestAssist?.status === "failed" && <p className="text-sm text-danger">Não foi possível gerar sugestões: {latestAssist.error ?? "erro ao processar"}</p>}
      {questions.length > 0 && <div className="space-y-2 rounded-xl border border-warning/20 bg-warning-soft p-3"><p className="text-sm font-medium text-warning">Ainda precisamos confirmar:</p>{questions.map((question, index) => <p key={`${question.field}-${index}`} className="text-sm text-ink-soft">• {question.question}</p>)}</div>}
      {aiFilled.length > 0 && <div role="status" className="space-y-1 rounded-xl border border-lake/25 bg-sky/25 p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink-strong"><Icon icon={Check}/> A IA preencheu {aiFilled.length} campo{aiFilled.length === 1 ? "" : "s"}: {aiFilled.map((key) => FIELD_LABELS[key] ?? key).join(", ")}.</p>
        <p className="text-xs text-ink-muted">Eles estão marcados como “Sugerido pela IA”. Confira{missing.size > 0 ? <>, complete o que está marcado como “Falta preencher” (<span className="text-danger">{[...missing].map((key) => FIELD_LABELS[key]).join(", ")}</span>)</> : ""} e salve a ficha.</p>
      </div>}
      {assistLoaded && !aiFilled.length && !assistInProgress && latestAssist?.status === "done" && <p role="status" className="text-xs text-ink-muted">A IA não encontrou dados novos para os campos vazios. Tente descrever o produto com mais detalhes.</p>}
    </Card>

    <FormSection title="Identificação e características" hint="Preencha apenas fatos confirmados. As medidas do produto são diferentes das medidas da embalagem.">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("identification", "internalName", "Nome interno", { hint: "Nome usado para organizar este produto no Studio." })}
        {input("identification", "family", "Família do produto")}
        {input("identification", "itemType", "Tipo do item", { requiredPath: "identification.itemType", help: "Ajude a identificar a categoria pela função do item." })}
        <Field label="Marca"><Input value="Verde Forma" disabled aria-label="Marca do produto" /></Field>
        {input("identification", "sku", "SKU principal")}
        {input("identification", "material", "Material confirmado", { requiredPath: "identification.material", help: "Confirme com a ficha de produção; a foto não comprova o material." })}
        {input("identification", "finish", "Acabamento")}
      </div>
      <Field label="Medidas do produto" status={statusOf("identification.dimensions")} hint="Informe só medidas conhecidas; não usamos medidas aproximadas da imagem.">
        <div className="grid gap-3 sm:grid-cols-4"><Input aria-label="Altura do produto" placeholder="Altura" inputMode="decimal" className={statusClass(statusOf("identification.dimensions"))} value={val(f.identification?.height)} onChange={(event) => set("identification", "height", event.target.value)} /><Input aria-label="Largura do produto" placeholder="Largura" inputMode="decimal" className={statusClass(statusOf("identification.dimensions"))} value={val(f.identification?.width)} onChange={(event) => set("identification", "width", event.target.value)} /><Input aria-label="Comprimento do produto" placeholder="Comprimento" inputMode="decimal" className={statusClass(statusOf("identification.dimensions"))} value={val(f.identification?.length)} onChange={(event) => set("identification", "length", event.target.value)} /><select className={selectClass} aria-label="Unidade das medidas" value={f.identification?.unit ?? "mm"} onChange={(event) => set("identification", "unit", event.target.value)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select></div>
      </Field>
      <div className="space-y-3">
        <Field label="Cores de filamento disponíveis" hint="Catálogo local Voolt3D. Marque somente as cores que você realmente oferece; escolher cores aqui não cria estoque nem variação automaticamente."><Input type="search" placeholder="Pesquisar cor ou linha…" value={colorSearch} onChange={(event) => setColorSearch(event.target.value)} /></Field>
        <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-2xl border border-line bg-canvas p-2 sm:grid-cols-2">
          {listColors.map((filament) => { const selected = selectedFilaments.includes(filament.id); return <button key={filament.id} type="button" aria-pressed={selected} onClick={() => set("identification", "filamentIds", selected ? selectedFilaments.filter((id) => id !== filament.id) : [...selectedFilaments, filament.id])} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${selected ? "bg-ink-strong text-white" : "text-ink-soft hover:bg-surface"}`}><Swatch color={filamentHex(filament)} className="size-5"/><span className="min-w-0 flex-1"><span className="block truncate">{filament.name}</span><span className={`block truncate text-xs ${selected ? "text-white/65" : "text-ink-muted"}`}>{filament.line}</span></span>{selected && <Icon icon={Check} className="size-4"/>}</button>; })}
          {!listColors.length && <p className="col-span-full p-3 text-sm text-ink-muted">Nenhuma cor encontrada.</p>}
        </div>
        <Field label="Combinações de cores vendidas" optional status={statusOf("identification.colors")} hint="Uma combinação por linha. Ex.: Branco + Rosa / Branco + Verde. Se não houver combinações, as cores selecionadas acima serão listadas individualmente."><Textarea rows={2} className={statusClass(statusOf("identification.colors"))} value={combinationText} onChange={(event) => setCombinationText(event.target.value)} placeholder="Branco + Rosa\nBranco + Verde" /></Field>
      </div>
    </FormSection>

    <FormSection title="Conteúdo e personalização">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("purchase", "pieces", "Quantidade total de peças", { type: "number" })}
        <Field label="Itens inclusos" required status={statusOf("purchase.included", "purchase.included")} hint="Um por linha no formato item: quantidade. Sem quantidade, conta como 1."><Textarea rows={3} aria-invalid={missing.has("purchase.included")} className={statusClass(statusOf("purchase.included", "purchase.included"))} value={f.purchase?.includedText ?? ""} onChange={(event) => set("purchase", "includedText", event.target.value)} placeholder="Porta-guardanapo: 4\nSuporte: 1" /></Field>
        <Field as="div" label={<span className="inline-flex items-center gap-2">Acessórios não inclusos <InfoTip title="Acessórios não inclusos" subtitle="Evite dúvidas no anúncio" description="Liste objetos que podem aparecer nas fotos, mas não acompanham a compra. Exemplo: bolo, vela, guardanapos ou peças usadas apenas como cenário." /></span>} optional status={statusOf("purchase.notIncluded")}><Textarea rows={2} className={statusClass(statusOf("purchase.notIncluded"))} value={f.purchase?.notIncludedText ?? ""} onChange={(event) => set("purchase", "notIncludedText", event.target.value)} placeholder="Bolo, vela e guardanapos" /></Field>
        {input("purchase", "assembly", "Montagem")}
      </div>
      <Field label="Aceita personalização?" status={statusOf("personalization.accepted")} hint="Informe somente se você oferece esta opção ao comprador."><select className={`${selectClass} ${statusClass(statusOf("personalization.accepted")) ?? ""}`} value={f.personalization?.accepted === undefined ? "" : String(f.personalization.accepted)} onChange={(event) => set("personalization", "accepted", event.target.value === "" ? undefined : event.target.value === "true")}><option value="">Não informado</option><option value="true">Sim, aceita</option><option value="false">Não aceita</option></select></Field>
      {f.personalization?.accepted === true && <div className="grid gap-4 sm:grid-cols-2">{input("personalization", "fieldsText", "O que pode ser personalizado", { hint: "Ex.: nome, número, texto" })}{input("personalization", "optionsAndLimits", "Opções e limites")}{input("personalization", "buyerInstructions", "Como o comprador envia os dados")}</div>}
    </FormSection>

    <FormSection title="Venda, embalagem e cuidados" hint="Estoque é a quantidade disponível agora. Capacidade de produção é outra informação e não configura pré-venda na Shopee.">
      <div className="grid gap-4 sm:grid-cols-2">
        {input("sale", "priceBRL", "Preço (R$)", { requiredPath: "sale.priceBRL", type: "text", help: "Informe o preço definido por você." })}
        {input("sale", "stock", "Estoque disponível", { requiredPath: "sale.stock", type: "number", help: "Informe o estoque atual ou selecione produção sob encomenda." })}
        <Field label="Forma de atendimento" status={statusOf("sale.fulfillment")}><select className={`${selectClass} ${statusClass(statusOf("sale.fulfillment")) ?? ""}`} value={f.sale?.fulfillment ?? ""} onChange={(event) => set("sale", "fulfillment", event.target.value || undefined)}><option value="">Não informado</option><option value="ready">Pronta entrega</option><option value="made_to_order">Produção sob encomenda</option></select></Field>
        {input("sale", "preparationDays", "Prazo real de preparação (dias)", { type: "number" })}
        {input("sale", "productionCapacity", "Capacidade de produção", { type: "number" })}
      </div>
      <Field label="Peso bruto do pacote" required status={statusOf("shipping.grossWeight", "shipping.grossWeight")} hint="Peso do pacote pronto para despacho, não o peso estimado do produto."><div className="grid grid-cols-[1fr_120px] gap-3"><Input aria-label="Peso bruto do pacote" inputMode="decimal" value={f.shipping?.grossValue ?? ""} aria-invalid={missing.has("shipping.grossWeight")} className={statusClass(statusOf("shipping.grossWeight", "shipping.grossWeight"))} onChange={(event) => set("shipping", "grossValue", event.target.value)} placeholder="Peso"/><select className={selectClass} aria-label="Unidade do peso" value={f.shipping?.grossUnit ?? "g"} onChange={(event) => set("shipping", "grossUnit", event.target.value)}><option value="g">g</option><option value="kg">kg</option></select></div></Field>
      <Field label="Dimensões externas da embalagem" required status={statusOf("shipping.packageDimensions", "shipping.packageDimensions")} hint="Medidas da caixa ou envelope já embalado para despacho."><div className="grid gap-3 sm:grid-cols-4"><Input aria-label="Altura da embalagem" placeholder="Altura" inputMode="decimal" value={f.shipping?.packageHeight ?? ""} onChange={(event) => set("shipping", "packageHeight", event.target.value)} className={statusClass(statusOf("shipping.packageDimensions", "shipping.packageDimensions"))}/><Input aria-label="Largura da embalagem" placeholder="Largura" inputMode="decimal" value={f.shipping?.packageWidth ?? ""} onChange={(event) => set("shipping", "packageWidth", event.target.value)} className={statusClass(statusOf("shipping.packageDimensions", "shipping.packageDimensions"))}/><Input aria-label="Comprimento da embalagem" placeholder="Comprimento" inputMode="decimal" value={f.shipping?.packageLength ?? ""} onChange={(event) => set("shipping", "packageLength", event.target.value)} className={statusClass(statusOf("shipping.packageDimensions", "shipping.packageDimensions"))}/><select className={selectClass} aria-label="Unidade das dimensões da embalagem" value={f.shipping?.packageUnit ?? "cm"} onChange={(event) => set("shipping", "packageUnit", event.target.value)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select></div></Field>
      <div className="grid gap-4 sm:grid-cols-2">{input("care", "purpose", "Finalidade de uso")}{input("care", "cleaning", "Limpeza e conservação")}{input("care", "limitations", "Limitações confirmadas")}{input("care", "printedFinishNotes", "Observações do acabamento impresso em 3D")}</div>
    </FormSection>

    <FormSection title="Variações comerciais" optional hint="Opcional. Cada combinação vendável recebe ID, SKU, preço, estoque e imagem. O catálogo de filamentos e imagens recoloridas não cria variações automaticamente."><Textarea rows={5} value={typeof f.variations === "string" ? f.variations : f.variations ? JSON.stringify(f.variations, null, 2) : ""} onChange={(event) => setTop("variations", event.target.value)} placeholder={'[{"id":"branco-rosa","values":{"color":"Branco + Rosa"},"sku":"VF-001-RS","priceBRL":"29,90","stock":4}]'} /></FormSection>

    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
      <div className="space-y-1">
        <p className="text-sm text-ink-muted">Campos com <span className="font-medium text-danger">*</span> são necessários para concluir a preparação. Você pode salvar antes e completar depois.</p>
        <p role="status" className={`text-xs ${dirty ? "text-warning" : "text-ink-faint"}`}>{dirty ? "Alterações ainda não salvas. Elas ficam guardadas neste navegador até você salvar." : "Tudo salvo."}</p>
      </div>
      <Button variant="primary" disabled={busy || !dirty} onClick={save}>{busy ? <Spinner/> : <Icon icon={Save}/>} Salvar ficha</Button>
    </div>
    {missing.size > 0 && <p role="status" className="text-sm text-danger">Para concluir ainda falta: {[...missing].map((key) => FIELD_LABELS[key]).join(", ")}.</p>}
  </div>;
}
