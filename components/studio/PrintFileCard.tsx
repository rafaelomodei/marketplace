"use client";

import { Ellipsis, FolderInput, ImageIcon, Printer, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, Code, Disclosure, Dropdown, Icon, MenuItem, NumberStepper, Spinner, Swatch } from "@/components/ui";
import { action, reportError } from "@/lib/client/api";
import type { LibraryFile } from "@/lib/library";
import { formatBytes, formatDuration, formatGrams, formatMoney } from "@/lib/text";
import { PlateViewer } from "./PlateViewer";

const COST_ROWS = [
  ["material", "Filamento"],
  ["energy", "Energia"],
  ["machine", "Desgaste da impressora"],
  ["labor", "Mão de obra"],
  ["extras", "Itens extras"],
] as const;

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={strong ? "text-xl tracking-[-0.02em] text-ink-strong" : "text-ink-strong"}>{value}</div>
    </div>
  );
}

/**
 * A file of a library project: its plates, printer and filaments and — for a 3MF configured in the slicer —
 * grams, time, cost and suggested price, calculated in the background whenever the file is saved.
 */
export function PrintFileCard({ slug, file, isCover, piecesPerObject, onChanged }: {
  slug: string;
  file: LibraryFile;
  isCover?: boolean;
  /** Printed pieces that form one finished object (from the project), to explain the objects per print. */
  piecesPerObject?: number | null;
  onChanged: () => void;
}) {
  const [plate, setPlate] = useState(file.info?.plates[0]?.plate ?? 1);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (name: string, input: Record<string, unknown> = {}) => {
    setBusy(name);
    try {
      await action(name, { project: slug, file: file.rel, ...input });
      onChanged();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  };
  const s = file.slice;
  const done = s?.status === "done" ? s : null;
  const used = done ? done.stats.filaments.map((f, i) => ({ ...f, grams: done.stats.grams[i] ?? 0 })).filter((f) => f.grams > 0) : [];
  const configured = !!file.info?.configured;

  return (
    <Card className="grid gap-5 p-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:p-5">
      <PlateViewer slug={slug} file={file.rel} plates={file.info?.plates ?? []} version={file.modifiedAt} plate={plate} onPlate={setPlate} width={480} />
      <div className="min-w-0 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="truncate font-medium text-ink-strong" title={file.name}>{file.name}</div>
            <div className="flex flex-wrap gap-1.5">
              {isCover && <Badge tone="success" dot>Capa</Badge>}
              {(done?.cost.printer ?? file.info?.printer) && <Badge>{done?.cost.printer ?? file.info?.printer}</Badge>}
              {file.info?.process && <Badge>{file.info.process}</Badge>}
              {configured && file.folder === "source" && <Badge tone="warning">Está na pasta de originais</Badge>}
            </div>
          </div>
          <Dropdown
            trigger={(open, toggle) => (
              <Button variant="ghost" size="icon" aria-label="Mais ações" aria-expanded={open} onClick={toggle}>
                <Icon icon={Ellipsis} />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem onClick={() => (close(), run("set_library_cover", { file: undefined, cover: { file: file.rel, plate } }))}>
                  <Icon icon={ImageIcon} /> Usar esta imagem como capa
                </MenuItem>
                {configured && (
                  <MenuItem onClick={() => (close(), run("recalculate_library_file"))}>
                    <Icon icon={RefreshCw} /> Recalcular agora
                  </MenuItem>
                )}
                <MenuItem onClick={() => (close(), run("move_library_file", { folder: file.folder === "print" ? "source" : "print" }))}>
                  <Icon icon={FolderInput} /> {file.folder === "print" ? "Mover para originais" : "Mover para prontos para imprimir"}
                </MenuItem>
                <MenuItem onClick={() => (close(), run("remove_library_file"))} className="text-danger">
                  <Icon icon={Trash2} /> Tirar do projeto
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>

        {done && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Filamento" value={formatGrams(done.stats.grams.reduce((a, b) => a + b, 0))} />
              <Stat label="Tempo" value={formatDuration(done.stats.seconds)} />
              <Stat label={done.cost.units > 1 ? `Custo dos ${done.cost.units}` : "Custo"} value={formatMoney(done.cost.batchTotal)} />
            </div>
            <div className="space-y-3 rounded-card bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-ink-strong">Rende</span>
                <NumberStepper value={file.units.count} onChange={(units) => run("set_library_file_units", { units })} min={1} max={999} step={1} unit={file.units.count === 1 ? "objeto" : "objetos"} label="objetos prontos por impressão" />
                <span className="text-xs text-ink-muted">
                  {file.units.source === "pieces" && `${file.measure?.pieces} peças ÷ ${piecesPerObject} por objeto`}
                  {file.units.source === "default" && (file.measure?.pieces ?? 0) > 1 && `${file.measure?.pieces} peças no arquivo · informe quantas formam um objeto em “Tamanho e peças” ou ajuste aqui`}
                  {file.units.source === "manual" && (
                    <button type="button" className="underline-offset-2 hover:text-ink-strong hover:underline" onClick={() => run("set_library_file_units", { units: null })}>Calcular sozinho</button>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Custo por unidade" value={formatMoney(done.cost.total)} />
                <Stat label="Preço sugerido por unidade" value={formatMoney(done.cost.price)} strong />
              </div>
            </div>
            {done.stats.paintIgnored && (
              <p className="text-xs text-ink-muted">
                Este modelo troca de cor (pintura ou troca por altura de camada) e o Creality Print trava ao calcular assim. Calculei como uma cor só: o total de gramas e o tempo ficam bem próximos, mas as trocas de filamento não entram.
              </p>
            )}
            {used.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-soft">
                {used.map((f, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <Swatch color={f.color} /> {f.type} · {formatGrams(f.grams)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {(s?.status === "queued" || s?.status === "running") && (
          <p className="flex items-center gap-2 text-sm text-ink-muted"><Spinner className="size-3.5" /> Calculando gramas, tempo e custo…</p>
        )}
        {s?.status === "failed" && <Alert tone="warning">Não consegui calcular este arquivo. {s.error}</Alert>}
        {s?.status === "no-slicer" && <Alert tone="warning">Informe onde está o Creality Print em Configurações para calcular gramas e tempo.</Alert>}
        {(s?.status === "not-configured" || (!file.info && file.type === "stl")) && (
          <p className="text-sm text-ink-muted">Abra no Creality Print, escolha impressora e filamento e salve o projeto (3MF) para calcular o custo.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => run("print_library_file")} disabled={busy === "print_library_file"}>
            {busy === "print_library_file" ? <Spinner /> : <Icon icon={Printer} />} {configured ? "Imprimir" : "Abrir no fatiador"}
          </Button>
          <span className="text-xs text-ink-muted">{formatBytes(file.size)}</span>
        </div>

        {done && (
          <Disclosure summary="Como o custo foi calculado">
            {done.cost.units > 1 && (
              <p className="mb-2 max-w-sm text-sm text-ink-muted">
                A impressão inteira (filamento, energia e desgaste) custa {formatMoney(done.cost.printTotal)} e é dividida pelos {done.cost.units} objetos. Itens extras e mão de obra são de cada objeto.
              </p>
            )}
            <dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              {COST_ROWS.map(([key, label]) => (
                <div key={key} className="contents">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="text-right tabular-nums text-ink-strong">{formatMoney(done.cost[key])}</dd>
                </div>
              ))}
              <dt className="border-t border-line pt-1 font-medium text-ink-strong">Custo por unidade</dt>
              <dd className="border-t border-line pt-1 text-right font-medium tabular-nums text-ink-strong">{formatMoney(done.cost.total)}</dd>
            </dl>
            {done.stats.plates.length > 1 && (
              <ul className="mt-3 space-y-0.5 text-sm text-ink-muted">
                {done.stats.plates.map((p) => (
                  <li key={p.plate}>Mesa {p.plate}: {formatGrams(p.grams.reduce((a, b) => a + b, 0))} · {formatDuration(p.seconds)}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Gramas e tempo calculados pelo {done.stats.slicer}.{" "}
              Filamento: {done.stats.grams.map((g, i) => `${formatGrams(g)} × ${formatMoney(done.cost.filamentPerKg[i] ?? 0)}/kg`).join(" + ")}. Preços em Custos e fatiador.
            </p>
            <Code className="mt-1 block">{file.rel}</Code>
          </Disclosure>
        )}
      </div>
    </Card>
  );
}
