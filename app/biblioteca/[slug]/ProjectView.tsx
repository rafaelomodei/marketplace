"use client";

import { ArrowLeft, Archive, ExternalLink, FolderOpen, PencilLine, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PrintFileCard } from "@/components/studio";
import {
  Alert,
  Button,
  Card,
  ChoiceGroup,
  Code,
  Container,
  Disclosure,
  Dropzone,
  ErrorBanner,
  Field,
  FormSection,
  Heading,
  Icon,
  InlineEdit,
  Input,
  Spinner,
  Textarea,
} from "@/components/ui";
import { action, reportError } from "@/lib/client/api";
import type { CostSettings } from "@/lib/costing";
import type { Project, ProjectMeta } from "@/lib/library";
import { formatSize } from "@/lib/text";
import { CoverPicker } from "./CoverPicker";
import { ColorsEditor } from "./ColorsEditor";
import { ExtrasEditor } from "./ExtrasEditor";
import { SalePricesEditor } from "./SalePricesEditor";
import { SizeEditor } from "./SizeEditor";
import { StudioSection } from "./StudioSection";
import { VariationsSection } from "./VariationsSection";

export default function ProjectView({ slug }: { slug: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [cost, setCost] = useState<CostSettings | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  /** Bumped when photos are sent from here, so the cover picker shows them. */
  const [studioTick, setStudioTick] = useState(0);

  const reload = useCallback(async () => {
    try {
      const p = await action<Project>("get_library_project", { project: slug });
      setProject(p);
      setError(null);
      return p;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    reload().then((p) => p && (setLink(p.sourceUrl), setNotes(p.notes)));
    action<{ categories: string[] }>("list_library").then((l) => setCategories(l.categories), reportError);
    action<{ cost: CostSettings }>("get_library_settings").then((s) => setCost(s.cost), reportError);
  }, [reload]);

  const calculating = project?.files.some((f) => f.slice?.status === "queued" || f.slice?.status === "running");
  useEffect(() => {
    const t = setInterval(reload, calculating ? 2500 : 8000);
    return () => clearInterval(t);
  }, [reload, calculating]);

  const save = async (patch: Partial<ProjectMeta>) => {
    try {
      await action("update_library_project", { project: slug, ...patch });
      await reload();
    } catch (e) {
      reportError(e);
    }
  };

  async function upload(files: File[]) {
    setUploading(true);
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    try {
      const res = await fetch(`/api/library/${slug}/files`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      await reload();
    } catch (e) {
      reportError(e);
    } finally {
      setUploading(false);
    }
  }

  if (error && !project)
    return (
      <Container className="pt-28">
        <Alert tone="danger">{error}</Alert>
      </Container>
    );
  if (!project)
    return (
      <Container className="pt-28">
        <Spinner className="size-6 text-ink-faint" />
      </Container>
    );

  const ready = project.files.filter((f) => f.info?.configured);
  const others = project.files.filter((f) => !f.info?.configured);
  const options = [...new Set([...categories, ...project.categories])].map((c) => ({ value: c, label: c }));
  const isCover = (rel: string) => !!project.cover && "file" in project.cover && project.cover.file === rel;
  const coverVersion = [JSON.stringify(project.cover), studioTick, ...project.files.map((f) => `${f.rel}:${f.modifiedAt}`)].join("|");
  const mainCost = ready.map((f) => (f.slice?.status === "done" ? f.slice.cost : null)).find(Boolean) ?? null;
  const offPattern = project.files.filter((f) => f.type !== "other" && !f.standardName);
  const card = (f: Project["files"][number]) => <PrintFileCard key={f.rel} slug={slug} file={f} isCover={isCover(f.rel)} piecesPerObject={project.pieces} onChanged={reload} />;

  return (
    <Container className="space-y-12 pt-24 pb-24">
      <div className="space-y-5">
        <Link href="/biblioteca" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong">
          <Icon icon={ArrowLeft} /> Biblioteca
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Heading as="h1" size="title">
            <InlineEdit value={project.name} label="Nome do projeto" onChange={(name) => save({ name })} />
          </Heading>
          <Button variant="secondary" onClick={() => action("open_library_folder", { project: slug }).catch(reportError)}>
            <Icon icon={FolderOpen} /> Abrir pasta
          </Button>
        </div>
        <p className="text-ink-soft">
          {project.object.size ? formatSize(project.object.size) : "Tamanho a informar"}
          {project.object.pieces && project.object.pieces > 1 ? ` · ${project.object.pieces} peças por objeto` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ChoiceGroup multiple options={options} value={project.categories} onChange={(c) => save({ categories: c })} />
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const c = newCategory.trim();
              if (c && !project.categories.includes(c)) save({ categories: [...project.categories, c] });
              setNewCategory("");
            }}
          >
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nova categoria" aria-label="Nova categoria" className="h-9 w-40 rounded-full" />
            <Button type="submit" size="icon" variant="ghost" aria-label="Adicionar categoria"><Icon icon={Plus} /></Button>
          </form>
        </div>
      </div>
      <ErrorBanner />

      {offPattern.length > 0 && (
        <Card tone="surface" className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="text-ink-strong">
              {offPattern.length === 1 ? "1 arquivo está fora do padrão de nomes" : `${offPattern.length} arquivos estão fora do padrão de nomes`}
            </p>
            <ul className="space-y-0.5 text-ink-muted">
              {offPattern.slice(0, 3).map((f) => (
                <li key={f.rel} className="truncate">
                  {f.name} → <span className="text-ink-strong">{f.standardBase}{f.name.slice(f.name.lastIndexOf(".")).toLowerCase()}</span>
                </li>
              ))}
              {offPattern.length > 3 && <li>e mais {offPattern.length - 3}</li>}
            </ul>
          </div>
          <Button
            size="sm"
            variant="soft"
            onClick={() => action("standardize_library_file_names", { project: slug }).then(reload, reportError)}
            title="Nome do projeto em camelCase + _impressora nos 3MF configurados. Se o arquivo estiver aberto no fatiador, abra de novo depois."
          >
            <Icon icon={PencilLine} /> Renomear
          </Button>
        </Card>
      )}

      <FormSection title="Capa" hint="A imagem que aparece no card da biblioteca. Pode ser uma mesa do arquivo 3D, uma foto que você enviou ou uma imagem feita no estúdio.">
        <CoverPicker project={slug} chosen={project.coverChosen} version={coverVersion} onChanged={reload} />
      </FormSection>

      <FormSection title="Prontos para imprimir" hint="3MF salvos no fatiador com impressora e filamento. Um arquivo por impressora ou material (ex.: Ender PLA, K1 PETG).">
        {ready.length ? ready.map(card) : <p className="text-sm text-ink-muted">Nenhum ainda. Abra um arquivo original no fatiador, configure e salve o projeto (3MF) na pasta <Code>fatiados</Code> deste projeto.</p>}
      </FormSection>

      <FormSection title="Variações" hint="O mesmo produto em outros tamanhos ou com outra parte (ex.: 10 cm e 15 cm, base redonda). Cada uma com seu arquivo, custo e preço.">
        <VariationsSection slug={slug} variations={project.variations} files={ready} onChanged={reload} />
        <Disclosure summary={project.colors.length ? `Cores com preço diferente (${project.colors.length})` : "Cores com preço diferente"} defaultOpen={project.colors.length > 0}>
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">Para cores de filamento mais caro (seda, glitter, brilha no escuro). Informe o preço do rolo de 1 kg; as cores normais não precisam entrar aqui.</p>
            <ColorsEditor
              colors={project.colors}
              normalPerKg={cost?.filaments[0]?.perKg ?? cost?.filamentPerKg ?? null}
              preview={project.single?.colors ?? null}
              onSave={(colors) => save({ colors })}
            />
          </div>
        </Disclosure>
      </FormSection>

      {project.variations.length === 0 && (
        <FormSection title="Preço de venda" hint="Por objeto montado. Dá para ter preço de kit: 1 un. por R$ 15, 10 un. por R$ 120… O lucro usa o custo por unidade do primeiro arquivo pronto.">
          <SalePricesEditor tiers={project.salePrices} unitCost={mainCost?.total ?? null} suggested={mainCost?.price ?? null} onSave={(salePrices) => save({ salePrices })} />
        </FormSection>
      )}

      <FormSection title="Fotos e imagens" hint="Fotos do produto impresso para o estúdio de imagens. O projeto é o mesmo lá: não precisa criar de novo.">
        <StudioSection project={slug} singlePiece={project.object.measured?.pieces === 1} onChanged={() => setStudioTick((t) => t + 1)} />
      </FormSection>

      <FormSection title="Arquivos originais" hint="Como vieram do MakerWorld ou de outro site, antes de configurar.">
        {others.map(card)}
        <Dropzone onFiles={upload} busy={uploading} accept=".3mf,.stl" title="Arraste arquivos STL ou 3MF aqui" hint="ou clique para escolher · 3MF já configurado vai direto para prontos para imprimir" />
      </FormSection>

      <FormSection title="Tamanho e peças" hint="Largura, comprimento e altura do objeto pronto. Ajuda a responder orçamentos sem abrir o arquivo.">
        <SizeEditor object={project.object} manualSize={project.size} manualPieces={project.pieces} onSave={save} />
      </FormSection>

      <FormSection title="Itens extras e mão de obra" hint="O que vai junto com cada peça e entra no custo: argola, sacolinha, embalagem…">
        {cost && <ExtrasEditor extras={project.extras} laborMinutes={project.laborMinutes} defaultLaborMinutes={cost.laborMinutes} onSave={save} />}
      </FormSection>

      <FormSection title="Origem e anotações">
        <div className="space-y-4">
          <Field label="Link do modelo" hint="MakerWorld, Printables, Thingiverse…" optional>
            <div className="flex gap-2">
              <Input value={link} onChange={(e) => setLink(e.target.value)} onBlur={() => link !== project.sourceUrl && save({ sourceUrl: link })} placeholder="https://makerworld.com/…" />
              {/^https?:\/\//.test(project.sourceUrl) && (
                <a href={project.sourceUrl} target="_blank" rel="noreferrer" className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink-strong" aria-label="Abrir link do modelo">
                  <Icon icon={ExternalLink} />
                </a>
              )}
            </div>
          </Field>
          <Field label="Anotações" optional>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== project.notes && save({ notes })} placeholder="Ex.: imprimir com brim; a versão G usa 15% de preenchimento" />
          </Field>
        </div>
      </FormSection>

      <Disclosure summary="Opções avançadas">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">Pasta do projeto: <Code>{project.folder}</Code></p>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              try {
                await action("archive_library_project", { project: slug });
                router.push("/biblioteca");
              } catch (e) {
                reportError(e);
              }
            }}
          >
            <Icon icon={Archive} /> Arquivar projeto
          </Button>
          <p className="text-xs text-ink-muted">A pasta vai para <Code>.lixeira</Code> dentro da biblioteca; nada é apagado.</p>
        </div>
      </Disclosure>
    </Container>
  );
}
