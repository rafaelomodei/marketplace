"use client";

import { ImageIcon, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PlateViewer } from "@/components/studio";
import { Badge, Button, Icon, ImageTile, Spinner } from "@/components/ui";
import { action, projectPictureUrl, reportError } from "@/lib/client/api";
import type { Cover, ProjectPicture } from "@/lib/library";

type Pictures = { cover: Cover | null; pictures: ProjectPicture[] };

const GROUPS = [
  { source: "file", title: "Do arquivo 3D" },
  { source: "photo", title: "Fotos que você enviou" },
  { source: "generated", title: "Imagens do estúdio" },
] as const;

const asCover = (p: ProjectPicture): Cover => (p.source === "file" ? { file: p.file, plate: p.plate } : { image: p.image });

/**
 * The cover of a project (what the library card shows): goes through the cover and every other picture — plates of
 * the 3MF, photos sent and images made in the studio — and makes the one on screen the cover.
 * `version` changes when something outside (files, photos, cover) changed, to fetch the pictures again.
 */
export function CoverPicker({ project, chosen, version, onChanged }: { project: string; /** A cover was chosen by hand. */ chosen: boolean; version: string; onChanged: () => void }) {
  const [data, setData] = useState<Pictures | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => action<Pictures>("list_library_pictures", { project }).then(setData, reportError), [project]);
  useEffect(() => void load(), [load, version]);

  async function choose(cover: Cover | null) {
    setBusy(true);
    try {
      await action("set_library_cover", { project, cover });
      await load();
      setIndex(0);
      onChanged();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner className="size-5 text-ink-faint" />;
  const { pictures } = data;
  if (!pictures.length) return <p className="text-sm text-ink-muted">Sem imagens ainda. Envie um arquivo 3D ou fotos do produto.</p>;
  const at = Math.min(index, pictures.length - 1);
  const current = pictures[at];
  const url = (p: ProjectPicture, w: number) => projectPictureUrl(project, p, w, p.version);

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,18rem)_1fr]">
      <div className="space-y-3">
        <PlateViewer
          slug={project}
          pictures={pictures.map((p, i) => ({ key: String(i), src: url(p, 640), label: p.label }))}
          index={at}
          onIndex={setIndex}
        >
          {current.cover && <Badge tone="success" dot className="absolute top-2 left-2">Capa</Badge>}
        </PlateViewer>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={busy || current.cover} onClick={() => choose(asCover(current))}>
            {busy ? <Spinner /> : <Icon icon={ImageIcon} />} {current.cover ? "Esta é a capa" : "Usar como capa"}
          </Button>
          {chosen && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => choose(null)} title="Volta a usar a primeira mesa de um arquivo pronto para imprimir">
              <Icon icon={RotateCcw} /> Voltar ao padrão
            </Button>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        {GROUPS.map((g) => {
          const items = pictures.map((p, i) => ({ p, i })).filter(({ p }) => p.source === g.source);
          if (!items.length) return null;
          return (
            <div key={g.source} className="space-y-2">
              <div className="text-sm text-ink-soft">{g.title}</div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-7">
                {items.map(({ p, i }) => (
                  <ImageTile
                    key={i}
                    src={url(p, 160)}
                    alt={p.label}
                    selected={i === at}
                    onSelect={() => setIndex(i)}
                    caption={p.cover ? "Capa" : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
