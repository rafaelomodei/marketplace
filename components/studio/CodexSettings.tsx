"use client";

import { Cpu, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Disclosure, Icon, Spinner } from "@/components/ui";
import { api, reportError } from "@/lib/client/api";
import type { StudioConfig } from "@/app/products/[slug]/shared";

export function CodexSettings() {
  const [config, setConfig] = useState<StudioConfig["codex"] | null>(null);
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api<StudioConfig>("/api/config").then((result) => { setConfig(result.codex); setModel(result.codex.model); }).catch(reportError);
  }, []);

  async function save() {
    setSaving(true); setSaved(false);
    try {
      const result = await api<StudioConfig["codex"]>("/api/config", { method: "PATCH", json: { model } });
      setConfig((old) => old ? { ...old, ...result } : null); setSaved(true);
    } catch (error) { reportError(error); }
    finally { setSaving(false); }
  }

  return <Card tone="surface" className="mx-auto max-w-2xl p-5 text-left">
    <Disclosure summary={<span className="inline-flex items-center gap-2"><Icon icon={Cpu} className="size-4"/> Configurações do Codex</span>}>
      {!config ? <Spinner/> : <div className="space-y-4">
        <label className="block space-y-2 text-sm font-medium text-ink-strong">
          Modelo para novas gerações
          <select className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5" value={model} onChange={(e) => { setModel(e.target.value); setSaved(false); }}>
            {config.models.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.detail}</option>)}
          </select>
        </label>
        <p className="text-xs leading-relaxed text-ink-muted">A escolha fica salva neste Studio e vale para jobs novos de imagens e anúncios. Jobs já enfileirados mantêm o modelo escolhido quando foram criados.</p>
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={saving || model === config.model} onClick={save}>{saving ? <Spinner/> : <Icon icon={Save}/>} Salvar modelo</Button>
          {saved && <span role="status" className="text-sm text-success">Configuração salva</span>}
        </div>
      </div>}
    </Disclosure>
  </Card>;
}
