"use client";

import { useState } from "react";
import { api, Button, Card, Spinner } from "@/components/ui";
import type { ImageRow } from "@/lib/db";
import type { Aspect } from "@/lib/prompts";
import { alertError, Thumb, type TabProps } from "./shared";

type Mode = "white-bg" | "scene" | "recolor";
type ColorRow = { part: string; filamentIds: string[] };

const MODES: { id: Mode; title: string; desc: string }[] = [
  { id: "white-bg", title: "Fundo branco", desc: "Packshot limpo em #FFFFFF, exigido por vários marketplaces." },
  { id: "scene", title: "Cenário de referência", desc: "Coloca o produto no cenário/estilo das suas referências." },
  { id: "recolor", title: "Variação de cor", desc: "Mesma imagem, com as cores trocadas por filamentos." },
];

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function GenerateTab({ product, config, reload, goTo }: TabProps) {
  const real = product.images.filter((i) => i.kind === "real");
  const style = product.images.filter((i) => i.kind === "style");
  const approved = product.images.filter((i) => i.kind === "approved");

  const [mode, setMode] = useState<Mode>("white-bg");
  const [productIds, setProductIds] = useState<number[]>(() => real.map((i) => i.id).slice(0, 3));
  const [styleIds, setStyleIds] = useState<number[]>(() => style.map((i) => i.id).slice(0, 1));
  const [sourceId, setSourceId] = useState<number | null>(approved[0]?.id ?? real[0]?.id ?? null);
  const [colors, setColors] = useState<ColorRow[]>([{ part: "produto inteiro", filamentIds: [] }]);
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [extra, setExtra] = useState("");
  const [sending, setSending] = useState(false);

  const jobCount = mode === "recolor" ? colors.filter((c) => c.filamentIds.length).reduce((n, c) => n * c.filamentIds.length, 1) : 1;
  const canSubmit =
    mode === "white-bg"
      ? productIds.length > 0
      : mode === "scene"
        ? productIds.length > 0 && styleIds.length > 0
        : sourceId !== null && colors.some((c) => c.filamentIds.length);

  async function submit() {
    setSending(true);
    const request =
      mode === "recolor"
        ? { type: mode, sourceImageId: sourceId, colors, extra }
        : mode === "scene"
          ? { type: mode, productImageIds: productIds, styleImageIds: styleIds, aspect, extra }
          : { type: mode, productImageIds: productIds, aspect, extra };
    try {
      await api("/api/jobs", { method: "POST", json: { product: product.slug, request } });
      await reload();
      goTo("candidates");
    } catch (e) {
      alertError(e);
    } finally {
      setSending(false);
    }
  }

  const picker = (images: ImageRow[], selected: number[], onPick: (id: number) => void, empty: string) =>
    images.length ? (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
        {images.map((img) => (
          <Thumb key={img.id} slug={product.slug} image={img} size={110} selected={selected.includes(img.id)} onClick={() => onPick(img.id)} />
        ))}
      </div>
    ) : (
      <p className="text-sm text-stone-400">{empty}</p>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((m) => (
            <Card
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`cursor-pointer p-3 ${mode === m.id ? "border-orange-400 ring-1 ring-orange-400" : "hover:border-stone-300"}`}
            >
              <div className="font-medium">{m.title}</div>
              <div className="text-sm text-stone-500">{m.desc}</div>
            </Card>
          ))}
        </div>

        {mode !== "recolor" && (
          <Section title="Fotos do produto" hint="A IA usa todas as selecionadas como o mesmo objeto (ângulos diferentes).">
            {picker(real, productIds, (id) => setProductIds(toggle(productIds, id)), "Adicione fotos reais na aba Referências.")}
          </Section>
        )}

        {mode === "scene" && (
          <Section title="Referências de estilo" hint="Cenário, luz e composição a copiar.">
            {picker(style, styleIds, (id) => setStyleIds(toggle(styleIds, id)), "Adicione referências de estilo na aba Referências.")}
          </Section>
        )}

        {mode === "recolor" && (
          <>
            <Section title="Imagem base" hint="De preferência uma imagem já aprovada; ela é recriada só trocando as cores.">
              {picker([...approved, ...real], sourceId ? [sourceId] : [], setSourceId, "Nenhuma imagem disponível.")}
            </Section>
            <Section
              title={`Cores (${config.filaments.brand})`}
              hint="Descreva a parte e escolha um ou mais filamentos. Várias escolhas geram uma imagem por combinação."
            >
              <div className="space-y-3">
                {colors.map((row, idx) => (
                  <Card key={idx} className="space-y-2 p-3">
                    <div className="flex gap-2">
                      <input
                        value={row.part}
                        onChange={(e) => setColors(colors.map((c, i) => (i === idx ? { ...c, part: e.target.value } : c)))}
                        placeholder="Parte (ex.: partes rosa, crina e cauda)"
                        className="flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
                      />
                      {colors.length > 1 && (
                        <Button variant="ghost" onClick={() => setColors(colors.filter((_, i) => i !== idx))}>
                          ✕
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {config.filaments.filaments.map((f) => {
                        const on = row.filamentIds.includes(f.id);
                        return (
                          <button
                            key={f.id}
                            title={`${f.line} · ${f.hex}`}
                            onClick={() =>
                              setColors(colors.map((c, i) => (i === idx ? { ...c, filamentIds: toggle(c.filamentIds, f.id) } : c)))
                            }
                            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
                              on ? "border-orange-500 bg-orange-50 font-medium" : "border-stone-200 hover:border-stone-400"
                            }`}
                          >
                            <span className="size-3 rounded-full border border-black/10" style={{ background: f.hex }} />
                            {f.name}
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                ))}
                <Button variant="ghost" onClick={() => setColors([...colors, { part: "", filamentIds: [] }])}>
                  + outra parte
                </Button>
              </div>
            </Section>
          </>
        )}
      </div>

      <Card className="h-fit space-y-4 p-4">
        {mode !== "recolor" && (
          <div className="space-y-1 text-sm">
            <span className="text-stone-600">Formato da imagem mestre</span>
            <div className="flex gap-2">
              {(["1:1", "3:4"] as Aspect[]).map((a) => (
                <Button key={a} variant={aspect === a ? "primary" : "default"} onClick={() => setAspect(a)} className="flex-1">
                  {a}
                </Button>
              ))}
            </div>
            <p className="text-xs text-stone-400">Depois de aprovada, você exporta para as proporções do marketplace.</p>
          </div>
        )}
        <label className="block space-y-1 text-sm">
          <span className="text-stone-600">Instruções extras (opcional)</span>
          <textarea
            rows={4}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Ex.: mesa de festa infantil com bolo branco, luz natural da manhã"
            className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          />
        </label>
        <Button variant="primary" className="w-full" disabled={!canSubmit || sending} onClick={submit}>
          {sending && <Spinner />} Gerar {jobCount > 1 ? `${jobCount} imagens` : "imagem"}
        </Button>
        <p className="text-xs text-stone-400">Cada imagem leva ~1–3 min no Codex. Os jobs entram numa fila e aparecem em Candidatas.</p>
      </Card>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-stone-500">{hint}</p>
      </div>
      {children}
    </section>
  );
}
