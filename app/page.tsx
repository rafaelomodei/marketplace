"use client";

import { ArrowRight, Camera, Download, MousePointerClick, PackageOpen, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProductCard } from "@/components/studio";
import {
  Alert,
  Badge,
  Button,
  Container,
  EmptyState,
  FeatureGrid,
  Heading,
  Icon,
  Input,
  Lead,
  PaintedBackdrop,
  SectionHeader,
  Spinner,
  type Feature,
} from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ProductSummary } from "@/lib/products";
import { STEPS } from "@/lib/workflow";

const STEP_ICONS = [Camera, Wand2, MousePointerClick, Download];
const HOW_IT_WORKS: Feature[] = STEPS.map((s, i) => ({ icon: STEP_ICONS[i], title: `${i + 1}. ${s.title}`, description: s.description }));

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api<ProductSummary[]>("/api/products").then(setProducts, (e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return document.getElementById("novo-nome")?.focus();
    setCreating(true);
    try {
      const { slug } = await api<{ slug: string }>("/api/products", { method: "POST", json: { name } });
      router.push(`/products/${slug}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  const inProgress = products?.filter((p) => p.stage === "create") ?? [];
  const ready = products?.filter((p) => p.stage === "ready") ?? [];

  return (
    <>
      <section className="relative flex min-h-[92svh] items-end pb-16">
        <PaintedBackdrop />
        <Container narrow className="relative animate-fade-up space-y-7 text-center">
          <Badge dot tone="accent">
            Feito para quem vende impressão 3D
          </Badge>
          <Heading as="h1" size="display">
            Fotos que vendem,
            <br />
            sem estúdio
          </Heading>
          <Lead className="mx-auto max-w-xl">
            Envie fotos do seu produto e a IA cria as imagens do anúncio para Shopee e Mercado Livre — sem mudar nenhum detalhe da peça.
          </Lead>
          <form id="novo" onSubmit={create} className="mx-auto flex max-w-md scroll-mt-40 flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do produto, ex.: Topo de bolo Amália"
              id="novo-nome"
              aria-label="Nome do novo produto"
              className="h-12 rounded-full px-5 shadow-float"
            />
            <Button type="submit" variant="primary" size="lg" disabled={creating}>
              {creating ? <Spinner /> : null} Começar <Icon icon={ArrowRight} />
            </Button>
          </form>
          {error && (
            <Alert tone="danger" onClose={() => setError(null)} className="mx-auto max-w-md text-left">
              {error}
            </Alert>
          )}
        </Container>
      </section>

      <Container id="como-funciona" className="scroll-mt-16 py-16">
        <SectionHeader eyebrow="Como funciona" title="Quatro passos, nenhum conhecimento técnico" className="mb-10" />
        <FeatureGrid features={HOW_IT_WORKS} />
      </Container>

      <Container id="produtos" className="scroll-mt-16 space-y-16 py-16">
        <SectionHeader
          eyebrow="Seus produtos"
          title="Em criação"
          description="Cada produto guarda as fotos, as imagens criadas e os arquivos prontos para o anúncio."
        />
        {!products && !error && <Spinner className="size-6 text-ink-faint" />}
        {products && !inProgress.length && (
          <EmptyState
            icon={PackageOpen}
            title="Nenhum produto ainda"
            description="Dê um nome ao seu primeiro produto lá em cima e siga os passos."
            action={
              <Button variant="primary" onClick={() => document.getElementById("novo-nome")?.focus()}>
                Criar produto
              </Button>
            }
          />
        )}
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {inProgress.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>

        {ready.length > 0 && (
          <div className="space-y-8 border-t border-line pt-16">
            <SectionHeader size="heading" title="Prontos" description="Produtos com os arquivos finalizados." />
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {ready.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          </div>
        )}
      </Container>

      <section className="relative mt-8 overflow-hidden py-32 text-center">
        <PaintedBackdrop scene="sky" fade={false} />
        <Container narrow className="relative space-y-5">
          <Badge dot tone="dark">
            Em breve
          </Badge>
          <Heading size="title" className="text-white">
            Use pelo seu assistente de IA
          </Heading>
          <Lead className="mx-auto max-w-lg text-white/80">
            Crie produtos, gere e aprove imagens conversando com o ChatGPT ou o Claude, conectados ao Studio via MCP.
          </Lead>
        </Container>
      </section>
    </>
  );
}
