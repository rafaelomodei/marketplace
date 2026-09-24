"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, Badge, Button, Card, fileUrl, Spinner } from "@/components/ui";
import type { ProductSummary } from "@/lib/products";

const COLUMNS = [
  { stage: "create", title: "Em criação", hint: "products/create" },
  { stage: "ready", title: "Prontos", hint: "products/ready" },
] as const;

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
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { slug } = await api<{ slug: string }>("/api/products", { method: "POST", json: { name } });
      router.push(`/products/${slug}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-sm text-stone-500">Cada produto é uma pasta. Coloque fotos reais e referências de estilo e gere as imagens do anúncio.</p>
        </div>
        <form onSubmit={create} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do novo produto"
            className="w-64 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm"
          />
          <Button variant="primary" disabled={creating || !name.trim()}>
            {creating ? <Spinner /> : "+"} Novo produto
          </Button>
        </form>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!products && !error && <Spinner className="size-6 text-stone-400" />}

      {products && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {COLUMNS.map((col) => {
            const items = products.filter((p) => p.stage === col.stage);
            return (
              <section key={col.stage} className="space-y-3">
                <h2 className="flex items-baseline gap-2 font-medium">
                  {col.title} <span className="text-sm text-stone-400">{items.length}</span>
                  <code className="ml-auto text-xs text-stone-400">{col.hint}</code>
                </h2>
                {!items.length && <p className="text-sm text-stone-400">Nenhum produto.</p>}
                <div className={`grid gap-3 ${col.stage === "create" ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
                  {items.map((p) => (
                    <Link key={p.slug} href={`/products/${p.slug}`}>
                      <Card className="overflow-hidden transition hover:border-orange-300 hover:shadow-sm">
                        <div className="aspect-[4/3] bg-stone-100">
                          {p.cover && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl(p.slug, p.cover, 480)} alt="" className="size-full object-cover" />
                          )}
                        </div>
                        <div className="space-y-2 p-3">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="truncate">{p.name}</span>
                            {p.activeJobs > 0 && <Spinner className="size-3.5 text-orange-500" />}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Badge>{p.counts.real} fotos</Badge>
                            <Badge>{p.counts.style} estilos</Badge>
                            {p.counts.pendingReview > 0 && <Badge tone="orange">{p.counts.pendingReview} p/ revisar</Badge>}
                            <Badge tone="green">{p.counts.approved} aprovadas</Badge>
                            {p.counts.export > 0 && <Badge tone="blue">{p.counts.export} exports</Badge>}
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
