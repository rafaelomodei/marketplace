"use client";

import { ArrowLeft, Archive, Ellipsis, ExternalLink, FolderOpen, ImageIcon, PencilLine, Plus, X } from "lucide-react";
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
  Dropdown,
  Dropzone,
  ErrorBanner,
  Field,
  Heading,
  Icon,
  InlineEdit,
  Input,
  MenuItem,
  Spinner,
  Textarea,
} from "@/components/ui";
import { action, projectPictureUrl, reportError } from "@/lib/client/api";
import { usePolling } from "@/lib/client/use-polling";
import type { CostSettings } from "@/lib/costing";
import type { Project, ProjectMeta } from "@/lib/library";
import { formatMoney, formatSize } from "@/lib/text";
import { CoverPicker } from "./CoverPicker";
import { ColorsEditor } from "./ColorsEditor";
import { ExtrasEditor } from "./ExtrasEditor";
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
  const [showCover, setShowCover] = useState(false);
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

  const calculating = project?.files.some((f) => f.measuring || f.slice?.status === "queued" || f.slice?.status === "running");
  usePolling(reload, calculating ? 2500 : 8000);

  const save = async (patch: Partial<ProjectMeta>) => {
    try {
      await action("update_library_project", { project: slug, ...patch });
      await reload();
    } catch (e) {
      reportError(e);
    }
  };

  async function upload(files: File[], variation?: string) {
    setUploading(true);
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (variation) form.set("variation", variation);
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


  const others = project.files.filter((f) => !f.info?.configured);
  const options = [...new Set([...categories, ...project.categories])].map((c) => ({ value: c, label: c }));
  const isCover = (rel: string) => !!project.cover && "file" in project.cover && project.cover.file === rel;
  const coverVersion = [JSON.stringify(project.cover), studioTick, ...project.files.map((f) => `${f.rel}:${f.modifiedAt}`)].join("|");
  const offPattern = project.files.filter((f) => f.type !== "other" && !f.standardName);
  const prices = project.variations
    .map((v) => v.salePrices.find((t) => t.quantity === 1)?.price ?? v.cost?.price ?? null)
    .filter((p): p is number => p !== null);
  const priceLine = !prices.length ? null
    : Math.min(...prices) === Math.max(...prices) ? formatMoney(prices[0])
    : `${formatMoney(Math.min(...prices))} a ${formatMoney(Math.max(...prices))}`;
  const subtitle = [
    project.object.size ? formatSize(project.object.size) : null,
    project.variations.length > 1 ? `${project.variations.length} variações` : null,
    priceLine,
  ].filter(Boolean).join(" · ");

  return (
    <Container className="space-y-14 pt-24 pb-24">
      <div className="space-y-6">
        <Link href="/biblioteca" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong">
          <Icon icon={ArrowLeft} /> Biblioteca
        </Link>
        <div className="flex flex-wrap items-start gap-5">
          <button
            type="button"
            onClick={() => setShowCover(true)}
            title="Trocar capa"
            className="size-24 shrink-0 overflow-hidden rounded-card bg-surface ring-1 ring-line transition hover:ring-ink-faint sm:size-28"
          >
            {project.cover && <img src={projectPictureUrl(slug, project.cover, 240)} alt="" className="size-full object-cover" />}
          </button>
          <div className="min-w-0 flex-1 space-y-2">
            <Heading as="h1" size="title">
              <InlineEdit value={project.name} label="Nome do projeto" onChange={(name) => save({ name })} />
            </Heading>
            {subtitle && <p className="text-ink-soft">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="secondary" onClick={() => action("open_library_folder", { project: slug }).catch(reportError)}>
              <Icon icon={FolderOpen} /> Abrir pasta
            </Button>
            <Dropdown
              trigger={(open, toggle) => (
                <Button variant="ghost" size="icon" aria-label="Mais ações" aria-expanded={open} onClick={toggle}>
                  <Icon icon={Ellipsis} />
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem onClick={() => (close(), setShowCover(true))}>
                    <Icon icon={ImageIcon} /> Trocar capa
                  </MenuItem>
                  {offPattern.length > 0 && (
                    <MenuItem
                      onClick={() => (close(), action("standardize_library_file_names", { project: slug }).then(reload, reportError))}
                      title="Nome do projeto em camelCase + _impressora nos 3MF configurados. Se o arquivo estiver aberto no fatiador, abra de novo depois."
                    >
                      <Icon icon={PencilLine} /> Padronizar nomes dos arquivos ({offPattern.length})
                    </MenuItem>
                  )}
                  <MenuItem
                    className="text-danger"
                    onClick={async () => {
                      close();
                      try {
                        await action("archive_library_project", { project: slug });
                        router.push("/biblioteca");
                      } catch (e) {
                        reportError(e);
                      }
                    }}
                  >
                    <Icon icon={Archive} /> Arquivar projeto
                  </MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {project.categories.length > 0 && (
            <ChoiceGroup multiple options={project.categories.map((c) => ({ value: c, label: c, hint: "Clique para tirar" }))} value={project.categories} onChange={(c) => save({ categories: c })} />
          )}
          <Dropdown
            align="start"
            trigger={(open, toggle) => (
              <Button size="sm" variant="ghost" aria-expanded={open} onClick={toggle}>
                <Icon icon={Plus} /> Categoria
              </Button>
            )}
          >
            {(close) => (
              <>
                {options.filter((o) => !project.categories.includes(o.value)).map((o) => (
                  <MenuItem key={o.value} onClick={() => (close(), save({ categories: [...project.categories, o.value] }))}>{o.label}</MenuItem>
                ))}
                <form
                  className="p-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const c = newCategory.trim();
                    if (c && !project.categories.includes(c)) save({ categories: [...project.categories, c] });
                    setNewCategory("");
                    close();
                  }}
                >
                  <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nova categoria" aria-label="Nova categoria" className="h-9 rounded-full" />
                </form>
              </>
            )}
          </Dropdown>
        </div>
      </div>
      <ErrorBanner />

      {showCover && (
        <Card tone="surface" className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-ink-strong">Capa</div>
              <p className="text-sm text-ink-muted">A imagem do card na biblioteca.</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setShowCover(false)}><Icon icon={X} /></Button>
          </div>
          <CoverPicker project={slug} chosen={project.coverChosen} version={coverVersion} onChanged={reload} />
        </Card>
      )}

      <VariationsSection project={project} upload={upload} uploading={uploading} onChanged={reload} />

      <section className="space-y-4">
        <h2 className="text-2xl tracking-[-0.03em] text-ink-strong">Mais sobre o produto</h2>
        <Card className="divide-y divide-line">
          <Row title="Fotos e estúdio de imagens" hint="Fotos do produto impresso e imagens para anunciar">
            <StudioSection project={slug} singlePiece={project.object.measured?.pieces === 1} onChanged={() => setStudioTick((t) => t + 1)} />
          </Row>
          <Row title="Itens extras e mão de obra" hint="Argola, sacolinha, embalagem… entram no custo de todas as variações">
            {cost && <ExtrasEditor extras={project.extras} laborMinutes={project.laborMinutes} defaultLaborMinutes={cost.laborMinutes} onSave={save} />}
          </Row>
          <Row title="Cores com preço diferente" hint={project.colors.length ? `${project.colors.length} ${project.colors.length === 1 ? "cor" : "cores"}` : "Seda, glitter, brilha no escuro…"}>
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">Informe o preço do rolo de 1 kg das cores de filamento mais caro. As cores normais não precisam entrar aqui. O acréscimo aparece no preço de cada variação.</p>
              <ColorsEditor
                colors={project.colors}
                normalPerKg={cost?.filaments[0]?.perKg ?? cost?.filamentPerKg ?? null}
                preview={project.variations[0]?.colors ?? null}
                onSave={(colors) => save({ colors })}
              />
            </div>
          </Row>
          <Row title="Tamanho e peças" hint="Medidas do objeto pronto, para orçamentos">
            <SizeEditor object={project.object} manualSize={project.size} manualPieces={project.pieces} onSave={save} />
          </Row>
          <Row title="Arquivos originais" hint={others.length ? `${others.length} ${others.length === 1 ? "arquivo" : "arquivos"} STL/3MF como vieram do site` : "STL ou 3MF como vieram do MakerWorld e outros sites"}>
            <div className="space-y-3">
              {others.map((f) => <PrintFileCard key={f.rel} slug={slug} file={f} isCover={isCover(f.rel)} piecesPerObject={project.pieces} onChanged={reload} />)}
              <Dropzone onFiles={(list) => upload(list)} busy={uploading} accept=".3mf,.stl" className="py-6" title="Arraste arquivos STL ou 3MF aqui" hint="3MF já configurado entra no produto, nos arquivos para imprimir" />
            </div>
          </Row>
          <Row title="Origem e anotações" hint={project.sourceUrl ? project.sourceUrl.replace(/^https?:\/\/(www\.)?/, "") : "Link do modelo e observações de impressão"}>
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
              <p className="text-xs text-ink-muted">Pasta do projeto: <Code>{project.folder}</Code></p>
            </div>
          </Row>
        </Card>
      </section>
    </Container>
  );
}

/** One collapsed block of "Mais sobre o produto": title and a short summary, content when opened. */
function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Disclosure
      className="px-5 py-4 sm:px-6"
      summary={
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-base text-ink-strong">{title}</span>
          {hint && <span className="truncate text-sm text-ink-muted">{hint}</span>}
        </span>
      }
    >
      <div className="pb-2">{children}</div>
    </Disclosure>
  );
}
