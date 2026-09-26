"use client";

import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreationCard } from "@/components/lab/CreationCard";
import { toolLook } from "@/components/lab/ToolCard";
import { ButtonLink, Container, EmptyState, ErrorBanner, Heading, Icon, Lead, PaintedBackdrop } from "@/components/ui";
import { api, reportError } from "@/lib/client/api";
import type { LabCreationSummary } from "@/lib/lab/creations";

/** "Minhas criações" of a Lab tool: reopen a saved piece or start a new one. */
export function CreationHistory({ tool, initial }: { tool: { id: string; name: string }; initial: LabCreationSummary[] }) {
  const router = useRouter();
  const [creations, setCreations] = useState(initial);
  const [sending, setSending] = useState<string | null>(null);
  const newHref = `/lab/${tool.id}/novo`;

  // Renders the piece on the server, creates the Studio product with the 3D pictures and opens it.
  const toStudio = async (id: string) => {
    setSending(id);
    try {
      const { slug } = await api<{ slug: string }>(`/api/lab/creations/${id}/studio`, { method: "POST" });
      router.push(`/products/${slug}`);
    } catch (e) {
      reportError(e);
      setSending(null);
    }
  };
  const replace = (c: LabCreationSummary) => setCreations((cs) => cs.map((x) => (x.id === c.id ? c : x)));
  const rename = async (id: string, name: string) => {
    try {
      replace(await api<LabCreationSummary>(`/api/lab/creations/${id}`, { method: "PATCH", json: { name } }));
    } catch (e) {
      reportError(e);
    }
  };
  const duplicate = async (id: string) => {
    try {
      const copy = await api<LabCreationSummary>(`/api/lab/creations/${id}/duplicate`, { method: "POST" });
      setCreations((cs) => [copy, ...cs]);
    } catch (e) {
      reportError(e);
    }
  };
  const remove = async (id: string) => {
    try {
      await api(`/api/lab/creations/${id}`, { method: "DELETE" });
      setCreations((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      reportError(e);
    }
  };

  return (
    <>
      <section className="relative pt-24 pb-10">
        <PaintedBackdrop scene="sky" className="h-72 opacity-70" />
        <Container className="relative space-y-4">
          <Link href="/lab" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong">
            <Icon icon={ArrowLeft} /> Lab
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-3">
              <Heading as="h1" size="title">
                {tool.name}
              </Heading>
              <Lead className="max-w-2xl">Suas criações ficam salvas aqui. Abra uma para continuar de onde parou, ou comece uma nova.</Lead>
            </div>
            <ButtonLink href={newHref} variant="primary" size="lg">
              <Icon icon={Plus} /> Nova criação
            </ButtonLink>
          </div>
        </Container>
      </section>

      <Container className="space-y-6 pb-24">
        <ErrorBanner />
        {creations.length ? (
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {creations.map((c) => (
              <CreationCard key={c.id} creation={c} busy={sending === c.id} onToStudio={() => toStudio(c.id)} onRename={(name) => rename(c.id, name)} onDuplicate={() => duplicate(c.id)} onDelete={() => remove(c.id)} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={toolLook(tool.id).icon}
            tone={toolLook(tool.id).tone}
            title="Nenhuma criação por aqui"
            description="Tudo o que você criar com esta ferramenta fica salvo aqui para abrir depois."
            action={
              <ButtonLink href={newHref} variant="secondary">
                <Icon icon={Plus} /> Criar agora
              </ButtonLink>
            }
          />
        )}
      </Container>
    </>
  );
}
