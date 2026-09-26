"use client";

import { Check, CloudOff, Eye, EyeOff, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Icon, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Param } from "@/lib/lab/params";
import type { LabToolState } from "./useLabTool";

/** Pieces shared by the Lab layouts (form page and full-screen editor). */

export const mm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Groups params by section, keeping the order in which sections first appear. */
export function groupBy(params: Param[]) {
  const groups = new Map<string, Param[]>();
  for (const p of params) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return [...groups];
}

/** "Gerando 3D…" / "Pronto" and the size of the printed piece. */
export function ModelStatus({ t }: { t: Pick<LabToolState, "busy" | "model" | "size"> }) {
  return (
    <>
      {t.busy ? (
        <Badge tone="warning" dot>
          Gerando 3D…
        </Badge>
      ) : t.model ? (
        <Badge tone="accent" dot>
          Pronto
        </Badge>
      ) : null}
      {t.size && (
        <Badge tone="accent">
          {mm(t.size[0])} × {mm(t.size[1])} × {mm(t.size[2])} mm
        </Badge>
      )}
    </>
  );
}

/** One button per preview-only part (e.g. the virtual clip) to hide it and look at the piece alone. */
export function PreviewToggles({ t }: { t: Pick<LabToolState, "previewParts" | "hiddenPreviews" | "togglePreview"> }) {
  return t.previewParts.map((p) => {
    const hidden = t.hiddenPreviews.includes(p.id);
    return (
      <Button key={p.id} size="sm" variant="secondary" aria-pressed={!hidden} onClick={() => t.togglePreview(p.id)}>
        <Icon icon={hidden ? EyeOff : Eye} /> {hidden ? `Mostrar ${p.label.toLowerCase()}` : `Esconder ${p.label.toLowerCase()}`}
      </Button>
    );
  });
}

export function PrintTips({ tips }: { tips: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-ink-muted">
      {tips.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" />
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Why the piece can't be made, with one-click fixes when the tool knows them (e.g. "Aumentar a peça para 36 mm"). */
export function ProblemAlert({ t }: { t: Pick<LabToolState, "problem" | "fixes" | "setMany" | "empty"> }) {
  if (!t.problem || t.empty) return null;
  return (
    <Alert tone="danger">
      <p>{t.problem}</p>
      {t.fixes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {t.fixes.map((f) => (
            <Button key={f.label} size="sm" variant="secondary" onClick={() => t.setMany(f.values)}>
              <Icon icon={Wand2} /> {f.label}
            </Button>
          ))}
        </div>
      )}
    </Alert>
  );
}

/** "Salvando…" / "Salvo": the piece goes to the tool's history on its own. */
export function SaveStatus({ t, className }: { t: Pick<LabToolState, "saving">; className?: string }) {
  const { status } = t.saving;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-ink-muted", status === "error" && "text-danger", className)}>
      {status === "saving" ? (
        <>
          <Spinner className="size-3" /> Salvando…
        </>
      ) : status === "saved" ? (
        <>
          <Icon icon={Check} className="size-3.5" /> Salvo em Minhas criações
        </>
      ) : status === "error" ? (
        <>
          <Icon icon={CloudOff} className="size-3.5" /> Não foi possível salvar
        </>
      ) : (
        "Salva sozinho enquanto você edita"
      )}
    </span>
  );
}

/**
 * Way out of the editor: back to the tool's history when there is one (this piece saved, or earlier ones),
 * otherwise to the Lab. Pending changes are saved before leaving, so the history already shows them.
 */
export function useEditorExit(t: Pick<LabToolState, "tool" | "saving">, hasHistory: boolean) {
  const router = useRouter();
  const toHistory = hasHistory || t.saving.savedAny;
  const href = toHistory ? `/lab/${t.tool.id}` : "/lab";
  return {
    href,
    label: toHistory ? "Minhas criações" : "Lab",
    onClick: async (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab: nothing to wait for
      e.preventDefault();
      await t.saving.flush();
      router.push(href);
    },
  };
}
