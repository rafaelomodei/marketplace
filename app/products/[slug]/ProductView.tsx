"use client";

import { ArrowLeft, CircleCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NextStepCard, ProductStatus } from "@/components/studio";
import { Alert, Badge, Button, Code, Container, ErrorBanner, Heading, Icon, Lightbox, PaintedBackdrop, Spinner, Stepper } from "@/components/ui";
import { api, fileUrl, reportError } from "@/lib/client/api";
import type { ProductDetail } from "@/lib/products";
import { completedSteps, nextStep, stateFromProduct, STEPS, type StepId } from "@/lib/workflow";
import { CreateStep } from "./CreateStep";
import { PhotosStep } from "./PhotosStep";
import { PublishStep } from "./PublishStep";
import { ReviewStep } from "./ReviewStep";
import type { StepProps, StudioConfig } from "./shared";

export default function ProductView({ slug }: { slug: string }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

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
            </div>
            {product.stage === "create" ? (
              <Button variant="secondary" disabled={!state.approved} onClick={() => move("ready")} title="Move a pasta para products/ready">
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
              s.id === "review" && state.activeJobs ? (
                <Spinner className="size-3 text-warning" />
              ) : s.id === "review" && state.pendingReview ? (
                <Badge tone="warning">{state.pendingReview}</Badge>
              ) : null,
          }))}
        />
        <ErrorBanner />
        <div key={step} className="animate-fade-up">
          {step === "photos" && <PhotosStep {...props} />}
          {step === "create" && <CreateStep {...props} />}
          {step === "review" && <ReviewStep {...props} />}
          {step === "publish" && <PublishStep {...props} />}
        </div>
      </Container>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
