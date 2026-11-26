"use client";

import { ArrowRight, Box } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Dropzone, Icon, ImageTile, Spinner } from "@/components/ui";
import { action, api, fileUrl, reportError } from "@/lib/client/api";

type Studio = { product: string | null; photos: { id: number; rel: string }[]; generated: number };

/**
 * The project's side in the image studio: product photos sent from here, the 3D model as reference pictures and
 * the way into the studio. The studio product is created on first use, with the project's name, size and price.
 */
export function StudioSection({ project, singlePiece, onChanged }: { project: string; singlePiece: boolean; /** Photos were added. */ onChanged?: () => void }) {
  const router = useRouter();
  const [studio, setStudio] = useState<Studio | null>(null);
  const [busy, setBusy] = useState<"upload" | "views" | "open" | null>(null);

  const load = useCallback(() => action<Studio>("get_library_studio", { project }).then(setStudio, reportError), [project]);
  useEffect(() => void load(), [load]);

  const ensure = async () => studio?.product ?? (await action<{ product: string }>("open_in_image_studio", { project })).product;

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<unknown>) {
    setBusy(kind);
    try {
      await work();
      await load();
      onChanged?.();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  }

  const upload = (files: File[]) =>
    run("upload", async () => {
      const product = await ensure();
      const form = new FormData();
      form.set("kind", "real");
      files.forEach((f) => form.append("files", f));
      await api(`/api/products/${product}/images`, { method: "POST", body: form });
    });

  if (!studio) return <Spinner className="size-5 text-ink-faint" />;
  const photos = studio.photos;

  return (
    <div className="space-y-5">
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => <ImageTile key={p.id} src={fileUrl(studio.product!, p.rel, 300)} />)}
          <Dropzone compact busy={busy === "upload"} onFiles={upload} />
        </div>
      ) : (
        <Dropzone busy={busy === "upload"} onFiles={upload} title="Arraste fotos do produto impresso aqui" />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={busy !== null}
          onClick={() => run("open", async () => router.push(`/products/${await ensure()}`))}
        >
          {busy === "open" ? <Spinner /> : null} {studio.product ? "Abrir no estúdio de imagens" : "Criar no estúdio de imagens"} <Icon icon={ArrowRight} />
        </Button>
        {singlePiece && (
          <Button
            variant="soft"
            disabled={busy !== null}
            onClick={() => run("views", () => action("add_model_views_to_studio", { project }))}
            title="Gera 4 vistas do modelo 3D (frente, lado, costas, cima) e coloca junto das fotos do produto"
          >
            {busy === "views" ? <Spinner /> : <Icon icon={Box} />} Usar o modelo 3D como foto
          </Button>
        )}
        <span className="text-sm text-ink-muted">
          {studio.product
            ? `${photos.length} ${photos.length === 1 ? "foto" : "fotos"} do produto${studio.generated ? ` · ${studio.generated} ${studio.generated === 1 ? "imagem aprovada" : "imagens aprovadas"}` : ""}`
            : "O produto é criado no estúdio com o mesmo nome, tamanho e preço deste projeto."}
        </span>
      </div>
    </div>
  );
}
