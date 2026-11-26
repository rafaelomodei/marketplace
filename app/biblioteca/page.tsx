"use client";

import { Boxes, Check, ChevronDown, Download, EyeOff, Printer, FolderPlus, Plus, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LibraryCard } from "@/components/studio";
import {
  Button,
  ButtonLink,
  Card,
  ChoiceGroup,
  Container,
  Dropdown,
  EmptyState,
  ErrorBanner,
  Icon,
  Input,
  MenuItem,
  SectionHeader,
  Spinner,
} from "@/components/ui";
import { action, reportError } from "@/lib/client/api";
import type { InboxFile, ProjectSummary } from "@/lib/library";
import { formatBytes, slugify, whenPtBr } from "@/lib/text";

type Library = { projects: ProjectSummary[]; categories: string[] };

function Inbox({ files, projects, onDone }: { files: InboxFile[]; projects: ProjectSummary[]; onDone: (slug?: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const run = async (name: string, input: unknown, open?: boolean) => {
    setBusy(JSON.stringify(input));
    try {
      const r = await action<{ slug?: string }>(name, input);
      onDone(open ? r.slug : undefined);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  };
  const shown = all ? files : files.slice(0, 5);
  return (
    <Card tone="surface" className="space-y-3 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink-strong">
        <Icon icon={Download} /> Baixados recentemente
        <span className="font-normal text-ink-muted">· arquivos 3D da pasta Downloads que ainda não estão na biblioteca</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((f) => (
          <li key={f.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink-strong" title={f.name}>{f.name}</div>
              <div className="text-xs text-ink-muted">{formatBytes(f.size)} · {whenPtBr(f.modifiedAt)}</div>
            </div>
            {busy?.includes(JSON.stringify(f.name)) && <Spinner className="size-3.5 text-ink-faint" />}
            <Button size="sm" onClick={() => run("import_downloads", { files: [f.name] }, true)}>
              <Icon icon={FolderPlus} /> Novo projeto
            </Button>
            {projects.length > 0 && (
              <Dropdown trigger={(open, toggle) => <Button size="sm" variant="soft" aria-expanded={open} onClick={toggle}>Adicionar a…</Button>}>
                {(close) => projects.map((p) => (
                  <MenuItem key={p.slug} onClick={() => (close(), run("import_downloads", { files: [f.name], project: p.slug }))}>{p.name}</MenuItem>
                ))}
              </Dropdown>
            )}
            <Button size="icon" variant="ghost" aria-label={`Ignorar ${f.name}`} title="Ignorar (o arquivo continua em Downloads)" onClick={() => run("dismiss_downloads", { files: [f.name] })}>
              <Icon icon={EyeOff} />
            </Button>
          </li>
        ))}
      </ul>
      {files.length > 5 && (
        <button type="button" onClick={() => setAll(!all)} className="text-sm text-ink-muted hover:text-ink-strong">
          {all ? "Mostrar menos" : `Ver todos (${files.length})`}
        </button>
      )}
    </Card>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const [library, setLibrary] = useState<Library | null>(null);
  const [inbox, setInbox] = useState<InboxFile[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [printer, setPrinter] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    action<Library>("list_library").then(setLibrary, reportError);
    action<InboxFile[]>("list_downloads").then(setInbox, reportError);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, library?.projects.some((p) => p.calculating) ? 3000 : 10000);
    return () => clearInterval(t);
  }, [load, library?.projects.some((p) => p.calculating)]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return document.getElementById("novo-projeto")?.focus();
    setCreating(true);
    try {
      const { slug } = await action<{ slug: string }>("create_library_project", { name, categories: category ? [category] : [] });
      router.push(`/biblioteca/${slug}`);
    } catch (err) {
      reportError(err);
      setCreating(false);
    }
  }

  const used = useMemo(() => [...new Set(library?.projects.flatMap((p) => p.categories) ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR")), [library]);
  /** Printers saved in the 3MFs ready to print, with how many projects use each. */
  const printers = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of library?.projects ?? []) for (const name of new Set(p.variants.flatMap((v) => (v.printer ? [v.printer] : [])))) count.set(name, (count.get(name) ?? 0) + 1);
    return [...count].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [library]);
  useEffect(() => {
    if (printer && library && !printers.some(([name]) => name === printer)) setPrinter("");
  }, [printer, printers, library]);
  const shown = (library?.projects ?? []).filter(
    (p) =>
      (!category || p.categories.includes(category)) &&
      (!printer || p.variants.some((v) => v.printer === printer)) &&
      (!query.trim() || slugify(`${p.name} ${p.categories.join(" ")}`).includes(slugify(query))),
  );

  return (
    <Container className="space-y-10 pt-28 pb-24">
      <SectionHeader
        eyebrow="Biblioteca"
        title="Seus modelos 3D"
        description="Arquivos baixados e fatiados, organizados por projeto. Ao salvar um 3MF no Creality Print, gramas, tempo e custo são recalculados sozinhos."
        action={
          <ButtonLink href="/biblioteca/configuracoes" variant="ghost">
            <Icon icon={Settings} /> Custos e fatiador
          </ButtonLink>
        }
      />
      <ErrorBanner />

      <form onSubmit={create} className="flex max-w-xl flex-col gap-2 sm:flex-row">
        <Input id="novo-projeto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do projeto, ex.: Vaso colmeia" aria-label="Nome do novo projeto" />
        <Button type="submit" variant="primary" disabled={creating}>
          {creating ? <Spinner /> : <Icon icon={Plus} />} Criar projeto
        </Button>
      </form>

      {inbox.length > 0 && library && <Inbox files={inbox} projects={library.projects} onDone={(slug) => (slug ? router.push(`/biblioteca/${slug}`) : load())} />}

      {!library && <Spinner className="size-6 text-ink-faint" />}
      {library && library.projects.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="A biblioteca está vazia"
          description="Crie um projeto acima ou traga um arquivo da lista de baixados. Os arquivos ficam em ~/VerdeForma/biblioteca."
        />
      )}
      {library && library.projects.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative w-full max-w-xs">
              <Icon icon={Search} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" aria-label="Buscar projetos" className="h-9 rounded-full pl-9" />
            </label>
            {used.length > 0 && (
              <ChoiceGroup options={[{ value: "", label: "Todas" }, ...used.map((c) => ({ value: c, label: c }))]} value={category} onChange={setCategory} />
            )}
            {printers.length > 0 && (
              <Dropdown
                align="start"
                trigger={(open, toggle) => (
                  <Button size="sm" variant={printer ? "soft" : "ghost"} aria-expanded={open} onClick={toggle} title="Impressora configurada no 3MF">
                    <Icon icon={Printer} /> <span className="max-w-56 truncate">{printer || "Todas as impressoras"}</span> <Icon icon={ChevronDown} />
                  </Button>
                )}
              >
                {(close) =>
                  [["", library.projects.length] as const, ...printers].map(([name, n]) => (
                    <MenuItem key={name} onClick={() => (setPrinter(name), close())}>
                      <Icon icon={Check} className={name === printer ? "" : "invisible"} />
                      <span className="flex-1">{name || "Todas as impressoras"}</span>
                      <span className="text-xs text-ink-muted tabular-nums">{n}</span>
                    </MenuItem>
                  ))
                }
              </Dropdown>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-ink-muted">Nenhum projeto encontrado.</p>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {shown.map((p) => <LibraryCard key={p.slug} project={p} printer={printer || undefined} />)}
            </div>
          )}
        </div>
      )}
    </Container>
  );
}
