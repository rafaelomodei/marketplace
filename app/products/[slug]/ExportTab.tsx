"use client";

import { useState } from "react";
import { api, Badge, Button, Card, fileUrl, Spinner } from "@/components/ui";
import { alertError, type TabProps } from "./shared";

type Mode = "auto" | "pad" | "crop";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "auto", label: "Automático", hint: "bordas brancas → completa com branco; cenário → recorte inteligente" },
  { id: "pad", label: "Completar com branco", hint: "mostra a imagem inteira" },
  { id: "crop", label: "Recorte inteligente", hint: "preenche o quadro, corta as bordas" },
];

export function ExportTab({ product, config, reload, preview, goTo }: TabProps) {
  const approved = product.images.filter((i) => i.kind === "approved");
  const exports = product.images.filter((i) => i.kind === "export");
  const mpIds = Object.keys(config.marketplaces);

  const [marketplace, setMarketplace] = useState(product.meta.marketplaces[0] ?? mpIds[0]);
  const targets = config.marketplaces[marketplace]?.targets ?? [];
  const [targetIds, setTargetIds] = useState<string[]>(() => targets.map((t) => t.id));
  const [mode, setMode] = useState<Mode>("auto");
  const [selected, setSelected] = useState<number[]>(() => approved.map((i) => i.id));
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    await fn().catch(alertError);
    await reload();
    setBusy(null);
  }

  const exportSelected = () =>
    run("export", () =>
      api(`/api/products/${product.slug}/export`, {
        method: "POST",
        json: { imageIds: selected, marketplace, targetIds, mode: mode === "auto" ? undefined : mode },
      }),
    );

  if (!approved.length)
    return (
      <p className="text-sm text-stone-400">
        Nenhuma imagem aprovada ainda. <button className="underline" onClick={() => goTo("candidates")}>Revisar candidatas</button>
      </p>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-4 md:grid-cols-2">
        {approved.map((img) => {
          const own = exports.filter((e) => e.parent_id === img.id);
          const isSelected = selected.includes(img.id);
          return (
            <Card key={img.id} className={`overflow-hidden ${isSelected ? "ring-2 ring-orange-500" : ""}`}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(product.slug, img.rel, 700)}
                  alt=""
                  onClick={() => preview(img.rel)}
                  className="aspect-square w-full cursor-zoom-in bg-stone-100 object-contain"
                />
                <label className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-white/90 px-2 py-1 text-xs shadow">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => setSelected(isSelected ? selected.filter((x) => x !== img.id) : [...selected, img.id])}
                  />
                  exportar
                </label>
              </div>
              <div className="space-y-3 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{img.label}</span>
                  <code className="ml-auto truncate text-xs text-stone-400">{img.rel}</code>
                </div>
                {own.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {own.map((e) => (
                      <button key={e.id} onClick={() => preview(e.rel)} className="space-y-1 text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileUrl(product.slug, e.rel, 160)} alt="" className="h-20 rounded border border-stone-200 bg-stone-50" />
                        <Badge tone="blue">{e.label}</Badge>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    disabled={busy === `reframe-${img.id}`}
                    title="Estende o cenário com IA em vez de cortar (gera nova candidata para aprovar)"
                    onClick={() =>
                      run(`reframe-${img.id}`, () => api(`/api/images/${img.id}`, { method: "POST", json: { action: "reframe", aspect: "3:4" } }))
                    }
                  >
                    ✨ Reenquadrar 3:4 com IA
                  </Button>
                  {img.parent_id && (
                    <Button
                      variant="ghost"
                      disabled={busy === `unapprove-${img.id}`}
                      onClick={() =>
                        run(`unapprove-${img.id}`, () => api(`/api/images/${img.parent_id}`, { method: "POST", json: { action: "reset" } }))
                      }
                    >
                      Remover aprovação
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="h-fit space-y-4 p-4">
        <h2 className="font-medium">Exportar para marketplace</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-stone-600">Marketplace</span>
          <select
            value={marketplace}
            onChange={(e) => {
              setMarketplace(e.target.value);
              setTargetIds(config.marketplaces[e.target.value].targets.map((t) => t.id));
            }}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5"
          >
            {mpIds.map((id) => (
              <option key={id} value={id}>
                {config.marketplaces[id].name}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1 text-sm">
          <span className="text-stone-600">Proporções</span>
          {targets.map((t) => (
            <label key={t.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={targetIds.includes(t.id)}
                onChange={() => setTargetIds(targetIds.includes(t.id) ? targetIds.filter((x) => x !== t.id) : [...targetIds, t.id])}
              />
              {t.label}
            </label>
          ))}
        </div>
        <div className="space-y-1 text-sm">
          <span className="text-stone-600">Como ajustar</span>
          {MODES.map((m) => (
            <label key={m.id} className="flex items-start gap-2">
              <input type="radio" checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-1" />
              <span>
                {m.label}
                <span className="block text-xs text-stone-400">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <Button variant="primary" className="w-full" disabled={!selected.length || !targetIds.length || busy === "export"} onClick={exportSelected}>
          {busy === "export" && <Spinner />} Exportar {selected.length} imagem(ns)
        </Button>
        <p className="text-xs text-stone-400">
          Arquivos em <code>exports/{marketplace}/&lt;proporção&gt;/</code> (JPG).
        </p>
      </Card>
    </div>
  );
}
