"use client";

import { Clock, ImagePlus, Plus, Wand2, X } from "lucide-react";
import { useState } from "react";
import { FilamentPicker, MODE_UI } from "@/components/studio";
import {
  Button,
  Card,
  ChoiceGroup,
  Disclosure,
  EmptyState,
  Field,
  FormSection,
  Icon,
  ImageTile,
  Input,
  OptionCard,
  SectionHeader,
  Spinner,
  Textarea,
} from "@/components/ui";
import { api, fileUrl, reportError } from "@/lib/client/api";
import type { ImageRow } from "@/lib/db";
import type { Aspect } from "@/lib/prompts";
import type { StepProps } from "./shared";

type Mode = "white-bg" | "scene" | "recolor" | "from-3d" | "staged";
type ColorRow = { part: string; filamentIds: string[] };
const ASPECT_LABEL: Record<Aspect, string> = { ref: "Igual ao cenário", "1:1": "Quadrada 1:1", "3:4": "Retrato 3:4" };

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function CreateStep({ product, config, reload, preview, goTo }: StepProps) {
  const real = product.images.filter((i) => i.kind === "real");
  const renders = product.images.filter((i) => i.kind === "render");
  const style = product.images.filter((i) => i.kind === "style");
  const approved = product.images.filter((i) => i.kind === "approved");
  const scenes = product.meta.lab?.scenes ?? [];
  // Made in the Lab: real-looking photos from the 3D come first; the other modes need a photo of the product.
  const modes: Mode[] = real.length ? [...(renders.length ? (["from-3d"] as const) : []), "white-bg", "staged", "scene", "recolor"] : ["from-3d"];

  const [mode, setMode] = useState<Mode>(real.length ? "white-bg" : "from-3d");
  const [renderIds, setRenderIds] = useState<number[]>(() => renders.map((i) => i.id));
  const [setting, setSetting] = useState(scenes[0] ?? "");
  const [productIds, setProductIds] = useState<number[]>(() => real.map((i) => i.id).slice(0, 3));
  const [sceneId, setSceneId] = useState<number | null>(style[0]?.id ?? null);
  const [replaceTarget, setReplaceTarget] = useState("");
  const [sourceId, setSourceId] = useState<number | null>(approved[0]?.id ?? real[0]?.id ?? null);
  const [colors, setColors] = useState<ColorRow[]>([{ part: "produto inteiro", filamentIds: [] }]);
  const [aspectChoice, setAspect] = useState<Aspect>("ref");
  // "ref" (keep the scene's own ratio) only makes sense when there is a scene. Photos from the 3D are always square.
  const aspectOptions: Aspect[] = mode === "scene" ? ["ref", "1:1", "3:4"] : ["1:1", "3:4"];
  const aspect = aspectOptions.includes(aspectChoice) ? aspectChoice : aspectOptions[0];
  const [extra, setExtra] = useState("");
  const [sending, setSending] = useState(false);

  if (!real.length && !renders.length)
    return (
      <EmptyState
        icon={ImagePlus}
        title="Primeiro, as fotos do produto"
        description="A IA precisa ver o produto de verdade para criar as imagens sem mudar nenhum detalhe."
        action={
          <Button variant="primary" onClick={() => goTo("photos")}>
            Enviar fotos
          </Button>
        }
      />
    );

  const jobCount =
    mode === "recolor"
      ? colors.filter((c) => c.filamentIds.length).reduce((n, c) => n * c.filamentIds.length, 1)
      : mode === "from-3d"
        ? renderIds.length
        : 1;
  const canSubmit =
    mode === "white-bg"
      ? productIds.length > 0
      : mode === "scene"
        ? productIds.length > 0 && sceneId !== null
        : mode === "from-3d"
          ? renderIds.length > 0
          : mode === "staged"
            ? productIds.length > 0 && setting.trim().length > 2
            : sourceId !== null && colors.some((c) => c.filamentIds.length);

  async function submit() {
    setSending(true);
    const request =
      mode === "recolor"
        ? { type: mode, sourceImageId: sourceId, colors, extra }
        : mode === "scene"
          ? { type: mode, sceneImageId: sceneId, productImageIds: productIds, replaceTarget, aspect, extra }
          : mode === "from-3d"
            ? { type: mode, renderImageIds: renderIds, extra }
            : mode === "staged"
              ? { type: mode, productImageIds: productIds, setting, aspect, extra }
              : { type: mode, productImageIds: productIds, aspect, extra };
    try {
      await api("/api/jobs", { method: "POST", json: { product: product.slug, request } });
      await reload();
      goTo("review");
    } catch (e) {
      reportError(e);
    } finally {
      setSending(false);
    }
  }

  const picker = (images: ImageRow[], selected: number[], onPick: (id: number) => void) => (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
      {images.map((img) => (
        <ImageTile
          key={img.id}
          src={fileUrl(product.slug, img.rel, 300)}
          selected={selected.includes(img.id)}
          onSelect={() => onPick(img.id)}
          onZoom={() => preview(img.rel)}
        />
      ))}
    </div>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
      <div className="space-y-12">
        <section className="space-y-5">
          <SectionHeader size="heading" title="O que você quer criar?" />
          <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
            {modes.map((m) => (
              <OptionCard key={m} {...MODE_UI[m]} selected={mode === m} onSelect={() => setMode(m)} />
            ))}
          </div>
          {!real.length && (
            <p className="text-sm text-ink-muted">
              Depois de aprovar as fotos reais, você libera o fundo branco, o produto em uso, o cenário e as outras cores.
            </p>
          )}
        </section>

        {mode === "from-3d" && (
          <FormSection
            title="Imagens do modelo 3D"
            hint="Cada imagem marcada vira uma foto da peça já impressa, no mesmo ângulo — com camadas, acabamento e as cores reais dos filamentos."
          >
            {picker(renders, renderIds, (id) => setRenderIds(toggle(renderIds, id)))}
          </FormSection>
        )}

        {mode === "staged" && (
          <FormSection title="Onde o produto aparece" hint="Descreva a cena em poucas palavras. A IA monta uma foto simples e natural, com o produto em destaque.">
            <div className="space-y-3">
              <Textarea rows={2} value={setting} onChange={(e) => setSetting(e.target.value)} placeholder="Ex.: pendurado no zíper de uma mochila escolar" />
              {scenes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {scenes.map((sc) => (
                    <Button key={sc} size="sm" variant={setting === sc ? "soft" : "secondary"} aria-pressed={setting === sc} onClick={() => setSetting(sc)}>
                      {sc}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </FormSection>
        )}

        {mode !== "recolor" && mode !== "from-3d" && (
          <FormSection title="Fotos do produto" hint="Já marcamos as primeiras. A IA usa todas as marcadas como o mesmo objeto, visto de ângulos diferentes.">
            {picker(real, productIds, (id) => setProductIds(toggle(productIds, id)))}
          </FormSection>
        )}

        {mode === "scene" && (
          <>
            <FormSection title="Cenário" hint="Esta foto é editada: fundo, objetos, luz e enquadramento ficam iguais.">
              {style.length ? (
                picker(style, sceneId ? [sceneId] : [], setSceneId)
              ) : (
                <EmptyState
                  icon={ImagePlus}
                  tone="rose"
                  title="Nenhum cenário ainda"
                  description="Envie uma foto de ambiente onde você quer ver o seu produto."
                  action={<Button onClick={() => goTo("photos")}>Enviar cenário</Button>}
                />
              )}
            </FormSection>
            <FormSection title="O que trocar na cena" hint="Deixe em branco para trocar o objeto mais parecido com o seu produto." optional>
              <Input value={replaceTarget} onChange={(e) => setReplaceTarget(e.target.value)} placeholder="Ex.: o topo de bolo em cima do bolo" />
            </FormSection>
          </>
        )}

        {mode === "recolor" && (
          <>
            <FormSection title="Imagem base" hint="De preferência uma imagem já aprovada. Ela é recriada trocando só as cores.">
              {picker([...approved, ...real], sourceId ? [sourceId] : [], setSourceId)}
            </FormSection>
            <FormSection
              title={`Cores (${config.filaments.brand})`}
              hint="Diga qual parte muda e escolha um ou mais filamentos. Cada combinação vira uma imagem."
            >
              <div className="space-y-3">
                {colors.map((row, idx) => (
                  <Card key={idx} tone="surface" className="space-y-4 p-4">
                    <div className="flex gap-2">
                      <Input
                        value={row.part}
                        onChange={(e) => setColors(colors.map((c, i) => (i === idx ? { ...c, part: e.target.value } : c)))}
                        placeholder="Parte (ex.: partes rosa, crina e cauda)"
                      />
                      {colors.length > 1 && (
                        <Button variant="ghost" size="icon" aria-label="Remover parte" onClick={() => setColors(colors.filter((_, i) => i !== idx))}>
                          <Icon icon={X} />
                        </Button>
                      )}
                    </div>
                    <FilamentPicker
                      catalog={config.filaments}
                      selected={row.filamentIds}
                      onToggle={(id) => setColors(colors.map((c, i) => (i === idx ? { ...c, filamentIds: toggle(c.filamentIds, id) } : c)))}
                    />
                  </Card>
                ))}
                <Button variant="ghost" onClick={() => setColors([...colors, { part: "", filamentIds: [] }])}>
                  <Icon icon={Plus} /> Outra parte
                </Button>
              </div>
            </FormSection>
          </>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:h-fit">
        <Card className="space-y-5 p-5">
          <div className="space-y-1">
            <p className="text-xs text-ink-muted">Você vai criar</p>
            <p className="text-lg tracking-[-0.02em] text-ink-strong">
              {jobCount > 1 ? `${jobCount} imagens` : "1 imagem"} · {MODE_UI[mode].title}
            </p>
          </div>
          <Button variant="primary" size="lg" className="w-full" disabled={!canSubmit || sending} onClick={submit}>
            {sending ? <Spinner /> : <Icon icon={Wand2} />} Criar {jobCount > 1 ? `${jobCount} imagens` : "imagem"}
          </Button>
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Icon icon={Clock} className="size-3.5" /> Leva de 1 a 3 minutos por imagem.
          </p>
          <Disclosure summary="Opções avançadas" className="border-t border-line pt-4">
            <div className="space-y-5">
              {mode !== "recolor" && mode !== "from-3d" && (
                <Field as="div" label="Formato" hint="Depois de aprovar, você ainda ajusta para o tamanho de cada marketplace.">
                  <ChoiceGroup value={aspect} onChange={setAspect} options={aspectOptions.map((a) => ({ value: a, label: ASPECT_LABEL[a] }))} />
                </Field>
              )}
              <Field label="Pode mudar também" optional hint="Só muda o que estiver escrito aqui. Todo o resto fica igual às fotos.">
                <Textarea
                  rows={3}
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="Ex.: trocar a toalha da mesa para branca; deixar a luz mais quente"
                />
              </Field>
            </div>
          </Disclosure>
        </Card>
      </aside>
    </div>
  );
}
