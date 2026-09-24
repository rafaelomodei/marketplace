"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, Badge, Button, fileUrl, Lightbox, Spinner } from "@/components/ui";
import { CandidatesTab } from "./CandidatesTab";
import { ExportTab } from "./ExportTab";
import { GenerateTab } from "./GenerateTab";
import { ReferencesTab } from "./ReferencesTab";
import { alertError, ErrorBanner, TABS, type Product, type StudioConfig, type TabId, type TabProps } from "./shared";

export default function ProductView({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("refs");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProduct(await api<Product>(`/api/products/${slug}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    reload();
    api<StudioConfig>("/api/config").then(setConfig, (e) => setError(e.message));
  }, [reload]);

  const active = product?.jobs.filter((j) => j.status === "queued" || j.status === "running").length ?? 0;
  const pendingReview = product?.images.filter((i) => i.kind === "generated" && i.status === "pending").length ?? 0;

  // Poll quickly while Codex is working so logs and results show up live.
  useEffect(() => {
    const t = setInterval(reload, active ? 2000 : 10000);
    return () => clearInterval(t);
  }, [reload, active]);

  if (error && !product) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!product || !config) return <Spinner className="size-6 text-stone-400" />;

  const approved = product.images.filter((i) => i.kind === "approved").length;
  const move = async (stage: "create" | "ready") => {
    await api(`/api/products/${slug}/move`, { method: "POST", json: { stage } }).catch((e) => alertError(e));
    await reload();
  };

  const props: TabProps = {
    product,
    config,
    reload,
    preview: (rel) => setLightbox(fileUrl(slug, rel)),
    goTo: setTab,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">
          ← Produtos
        </Link>
        <h1 className="text-2xl font-semibold">{product.meta.name}</h1>
        <Badge tone={product.stage === "ready" ? "green" : "orange"}>{product.stage === "ready" ? "Pronto" : "Em criação"}</Badge>
        <code className="text-xs text-stone-400">
          products/{product.stage}/{slug}
        </code>
        <div className="ml-auto flex gap-2">
          {product.stage === "create" ? (
            <Button variant="success" disabled={!approved} onClick={() => move("ready")} title="Move a pasta para products/ready">
              ✓ Marcar como pronto
            </Button>
          ) : (
            <Button onClick={() => move("create")}>Voltar para criação</Button>
          )}
        </div>
      </div>

      <nav className="flex gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-orange-500 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {t.label}
            {t.id === "candidates" && active > 0 && <Spinner className="size-3 text-orange-500" />}
            {t.id === "candidates" && pendingReview > 0 && <Badge tone="orange">{pendingReview}</Badge>}
            {t.id === "export" && approved > 0 && <Badge tone="green">{approved}</Badge>}
          </button>
        ))}
      </nav>

      <ErrorBanner />

      {tab === "refs" && <ReferencesTab {...props} />}
      {tab === "generate" && <GenerateTab {...props} />}
      {tab === "candidates" && <CandidatesTab {...props} />}
      {tab === "export" && <ExportTab {...props} />}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
