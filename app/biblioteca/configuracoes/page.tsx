"use client";

import { ArrowLeft, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, Code, Container, ErrorBanner, Field, FormSection, Heading, Icon, Input, Lead, Spinner } from "@/components/ui";
import { action, reportError } from "@/lib/client/api";
import type { CostSettings, Printer } from "@/lib/costing";
import type { Slicer } from "@/lib/slicer";

type Settings = { cost: CostSettings; slicer: { path: string; found: Slicer | null } };

const num = (s: string) => Number(s.trim().replace(",", "."));
const show = (n: number, decimals = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: decimals, useGrouping: false });

/** Number field that keeps what is typed and only reports valid numbers (comma or dot). */
function NumberInput({ value, onChange, label, suffix, scale = 1 }: { value: number; onChange: (v: number) => void; label: string; suffix?: string; scale?: number }) {
  const [text, setText] = useState(show(value * scale, 6));
  useEffect(() => setText(show(value * scale, 6)), [value, scale]);
  return (
    <div className="relative">
      <Input
        value={text}
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => (Number.isFinite(num(text)) && num(text) >= 0 ? onChange(num(text) / scale) : setText(show(value * scale, 6)))}
        className={suffix ? "pr-16" : undefined}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-ink-muted">{suffix}</span>}
    </div>
  );
}

export default function LibrarySettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cost, setCost] = useState<CostSettings | null>(null);
  const [slicerPath, setSlicerPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    action<Settings>("get_library_settings").then((s) => (setSettings(s), setCost(s.cost), setSlicerPath(s.slicer.path)), reportError);
  }, []);

  async function save() {
    if (!cost) return;
    setSaving(true);
    try {
      const s = await action<Settings>("update_library_settings", { cost, slicer: { path: slicerPath } });
      setSettings(s);
      setCost(s.cost);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!settings || !cost)
    return (
      <Container className="pt-28">
        <Spinner className="size-6 text-ink-faint" />
      </Container>
    );

  const set = (patch: Partial<CostSettings>) => setCost({ ...cost, ...patch });
  const setPrinter = (i: number, patch: Partial<Printer>) => set({ printers: cost.printers.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <Container narrow className="space-y-12 pt-24 pb-24">
      <div className="space-y-4">
        <Link href="/biblioteca" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink-strong">
          <Icon icon={ArrowLeft} /> Biblioteca
        </Link>
        <Heading as="h1" size="title">Custos e fatiador</Heading>
        <Lead>A mesma conta da planilha: filamento + energia + desgaste da impressora + mão de obra + itens extras. Gramas e tempo vêm do fatiador.</Lead>
      </div>
      <ErrorBanner />

      <FormSection title="Fatiador" hint="Usado para calcular gramas e tempo em segundo plano e para abrir os arquivos na hora de imprimir.">
        {settings.slicer.found ? (
          <Alert tone="success">Usando <strong>{settings.slicer.found.label}</strong> <Code className="block break-all">{settings.slicer.found.path}</Code></Alert>
        ) : (
          <Alert tone="warning">Não encontrei o Creality Print. Informe o caminho do programa abaixo.</Alert>
        )}
        <Field label="Caminho do programa" hint="Deixe vazio para encontrar sozinho o Creality Print mais recente. Ao atualizar o AppImage, aponte o arquivo novo aqui." optional>
          <Input value={slicerPath} onChange={(e) => setSlicerPath(e.target.value)} placeholder="/home/…/CrealityPrint-V7.2.1….AppImage" />
        </Field>
      </FormSection>

      <FormSection title="Fórmula de custo">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Energia" hint="Tarifa com impostos e bandeira"><NumberInput label="Energia em reais por kWh" value={cost.energyPerKwh} onChange={(v) => set({ energyPerKwh: v })} suffix="R$/kWh" /></Field>
          <Field label="Mão de obra" hint="Valor da hora de trabalho"><NumberInput label="Mão de obra em reais por hora" value={cost.laborPerHour} onChange={(v) => set({ laborPerHour: v })} suffix="R$/h" /></Field>
          <Field label="Minutos de mão de obra por peça" hint="Montagem, acabamento e embalagem. Cada projeto pode mudar."><NumberInput label="Minutos por peça" value={cost.laborMinutes} onChange={(v) => set({ laborMinutes: v })} suffix="min" /></Field>
          <Field label="Perda de filamento" hint="Falhas e purga"><NumberInput label="Perda em porcentagem" value={cost.waste} scale={100} onChange={(v) => set({ waste: Math.min(1, v) })} suffix="%" /></Field>
          <Field label="Margem sobre a venda" hint="50% = metade do preço é lucro"><NumberInput label="Margem em porcentagem" value={cost.margin} scale={100} onChange={(v) => set({ margin: Math.min(0.95, v) })} suffix="%" /></Field>
        </div>
      </FormSection>

      <FormSection title="Preço do filamento" hint="Quanto você paga por quilo de cada tipo. O tipo vem do 3MF (PLA, PETG…).">
        <div className="space-y-3">
          {cost.filaments.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_9rem_2.25rem] gap-2">
              <Input value={f.type} onChange={(e) => set({ filaments: cost.filaments.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} aria-label="Tipo de filamento" className="h-10" />
              <NumberInput label={`Preço do ${f.type} por kg`} value={f.perKg} onChange={(v) => set({ filaments: cost.filaments.map((x, j) => (j === i ? { ...x, perKg: v } : x)) })} suffix="R$/kg" />
              <Button variant="ghost" size="icon" aria-label={`Tirar ${f.type}`} onClick={() => set({ filaments: cost.filaments.filter((_, j) => j !== i) })}><Icon icon={X} /></Button>
            </div>
          ))}
          <Button size="sm" variant="soft" onClick={() => set({ filaments: [...cost.filaments, { type: "TPU", perKg: 120 }] })}>
            <Icon icon={Plus} /> Adicionar tipo
          </Button>
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <Field label="Outros tipos" hint="Qualquer filamento fora da lista"><NumberInput label="Preço padrão do filamento por kg" value={cost.filamentPerKg} onChange={(v) => set({ filamentPerKg: v })} suffix="R$/kg" /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-0.5" checked={cost.useSlicerPrice} onChange={(e) => set({ useSlicerPrice: e.target.checked })} />
            <span>Usar o preço cadastrado no perfil de filamento do fatiador, quando houver. Deixe desmarcado se os perfis do Creality Print estão com o preço padrão (R$ 20/kg).</span>
          </label>
        </div>
      </FormSection>

      <FormSection title="Impressoras" hint="Reconhecidas pelo nome do perfil de impressora salvo no 3MF (ex.: “Ender-3 V3” em “Creality Ender-3 V3 0.4 nozzle”).">
        <div className="space-y-3">
          <div className="hidden grid-cols-[1fr_1fr_6rem_6rem_2.25rem] gap-2 px-1 text-xs text-ink-muted sm:grid">
            <span>Nome</span><span>Texto no perfil</span><span>Potência (W)</span><span>Desgaste R$/h</span><span />
          </div>
          {cost.printers.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_6rem_6rem_2.25rem]">
              <Input value={p.name} onChange={(e) => setPrinter(i, { name: e.target.value })} aria-label="Nome da impressora" className="h-10" />
              <Input value={p.match} onChange={(e) => setPrinter(i, { match: e.target.value })} aria-label="Texto no perfil do fatiador" className="h-10" />
              <NumberInput label="Potência em watts" value={p.powerW} onChange={(v) => setPrinter(i, { powerW: v || 1 })} />
              <NumberInput label="Desgaste em reais por hora" value={p.machinePerHour} onChange={(v) => setPrinter(i, { machinePerHour: v })} />
              <Button variant="ghost" size="icon" aria-label={`Tirar ${p.name}`} onClick={() => set({ printers: cost.printers.filter((_, j) => j !== i) })}><Icon icon={X} /></Button>
            </div>
          ))}
          <Button size="sm" variant="soft" onClick={() => set({ printers: [...cost.printers, { name: "Nova impressora", match: "Nova impressora", powerW: 350, machinePerHour: 2 }] })}>
            <Icon icon={Plus} /> Adicionar impressora
          </Button>
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <Field label="Outras impressoras: potência"><NumberInput label="Potência padrão em watts" value={cost.otherPrinter.powerW} onChange={(v) => set({ otherPrinter: { ...cost.otherPrinter, powerW: v || 1 } })} suffix="W" /></Field>
            <Field label="Outras impressoras: desgaste"><NumberInput label="Desgaste padrão em reais por hora" value={cost.otherPrinter.machinePerHour} onChange={(v) => set({ otherPrinter: { ...cost.otherPrinter, machinePerHour: v } })} suffix="R$/h" /></Field>
          </div>
        </div>
      </FormSection>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving}>{saving && <Spinner />} Salvar</Button>
        {saved && <span className="text-sm text-success">Salvo. Os custos já foram atualizados.</span>}
      </div>
    </Container>
  );
}
