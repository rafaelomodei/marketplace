"use client";

import { ArrowLeft, Boxes, CircleCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NextStepCard, ProductStatus } from "@/components/studio";
import { Alert, Badge, Button, Code, Container, ErrorBanner, Heading, Icon, Lightbox, PaintedBackdrop, Spinner, Stepper } from "@/components/ui";
import { action, api, fileUrl, reportError } from "@/lib/client/api";
import type { LibraryFacts } from "@/lib/library-studio";
import { formatMoney, formatSize } from "@/lib/text";
import type { ProductDetail } from "@/lib/products";
import { completedSteps, nextStep, stateFromProduct, STEPS, type StepId } from "@/lib/workflow";
import { CreateStep } from "./CreateStep";
import { PhotosStep } from "./PhotosStep";
import { PublishStep } from "./PublishStep";
import { ReviewStep } from "./ReviewStep";
import { InfoStep } from "./InfoStep";
import { ListingStep } from "./ListingStep";
import type { StepProps, StudioConfig } from "./shared";

export default function ProductView({ slug }: { slug: string }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryFacts | null>(null);

  const reload = useCallback(async () => {
    try {
      setProduct(await api<ProductDetail>(`/api/products/${slug}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    reload();
    api<StudioConfig>("/api/config").then(setConfig, (e) => setError(e.message));
  }, [reload]);

  const state = product ? stateFromProduct(product) : null;

  // The print-library project this product came from: size, pieces and prices, with a way back.
  const libraryProject = product?.meta.libraryProject;
  useEffect(() => {
    if (libraryProject) action<LibraryFacts | null>("get_product_library", { slug }).then(setLibrary, () => setLibrary(null));
  }, [slug, libraryProject]);

  // Poll quickly while the AI is working so progress and results show up live.
  useEffect(() => {
    const t = setInterval(reload, state?.activeJobs ? 2000 : 10000);
    return () => clearInterval(t);
  }, [reload, state?.activeJobs]);

  // Open on the step that needs attention.
  useEffect(() => {
    if (state && step === null) setStep(nextStep(state).step);
  }, [state, step]);

  if (error && !product)
    return (
      <Container className="pt-28">
        <Alert tone="danger">{error}</Alert>
      </Container>
    );
  if (!product || !config || !state || !step)
    return (
      <Container className="pt-28">
        <Spinner className="size-6 text-ink-faint" />
      </Container>
    );

  const next = nextStep(state);
  const done = completedSteps(state);
  const isAnalyzingProduct = product.jobs.some((job) => job.type === "facts-assist" && (job.status === "queued" || job.status === "running"));
  const move = async (stage: "create" | "ready") => {
    await api(`/api/products/${slug}/move`, { method: "POST", json: { stage } }).catch(reportError);
    await reload();
  };

  const props: StepProps = {
    product,
    config,
    reload,
    preview: (rel) => setLightbox(fileUrl(slug, rel)),
    goTo: setStep,
  };

  return (
    <>
      <section className="relative pt-24 pb-6">
        <PaintedBackdrop align="middle" className="h-80" />
        <Container className="relative space-y-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong">
            <Icon icon={ArrowLeft} /> Produtos
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-3">
              <ProductStatus next={next} />
              <Heading as="h1" size="title">
                {product.meta.name}
              </Heading>
              <Code>
                products/{product.stage}/{slug}
              </Code>
              {library && (
                <Link href={`/biblioteca/${library.project}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft hover:text-ink-strong">
                  <Icon icon={Boxes} /> Biblioteca
                  <span className="text-ink-muted">
                    {[
                      library.size && formatSize(library.size),
                      library.pieces && library.pieces > 1 && `${library.pieces} peças por objeto`,
                      library.grams !== null && `${library.grams.toLocaleString("pt-BR")} g de filamento`,
                      ...library.salePrices.map((t) => `${t.quantity} un. ${formatMoney(t.price)}`),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              )}
            </div>
            {product.stage === "create" ? (
              <Button variant="secondary" onClick={() => move("ready")} title="Valida ficha, anúncio e imagens antes de mover a pasta">
                <Icon icon={CircleCheck} /> Marcar como pronto
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => move("create")}>
                <Icon icon={Undo2} /> Voltar para criação
              </Button>
            )}
          </div>
          <NextStepCard next={next} onGo={() => setStep(next.step)} />
        </Container>
      </section>

      <Container className="space-y-8 pb-24">
        <Stepper
          current={step}
          onSelect={setStep}
          steps={STEPS.map((s) => ({
            id: s.id,
            label: s.label,
            done: done[s.id],
            badge:
              s.id === "info" && isAnalyzingProduct ? (
                <Spinner className="size-3 text-warning" />
              ) : s.id === "review" && state.activeImageJobs ? (
                <Spinner className="size-3 text-warning" />
              ) : s.id === "review" && state.pendingReview ? (
                <Badge tone="warning">{state.pendingReview}</Badge>
              ) : null,
          }))}
        />
        <ErrorBanner />
        <div key={step} className="animate-fade-up">
          {step === "info" && <InfoStep {...props} />}
          {step === "photos" && <PhotosStep {...props} />}
          {step === "create" && <CreateStep {...props} />}
          {step === "review" && <ReviewStep {...props} />}
          {step === "publish" && <PublishStep {...props} />}
          {step === "listing" && <ListingStep {...props} />}
        </div>
      </Container>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
