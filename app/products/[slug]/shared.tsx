"use client";

import { useEffect, useState } from "react";
import { Card, fileUrl } from "@/components/ui";
import type { FilamentCatalog, Marketplace } from "@/lib/config";
import type { ImageRow, JobRow } from "@/lib/db";
import type { ProductMeta } from "@/lib/products";

export type Product = { slug: string; stage: "create" | "ready"; meta: ProductMeta; images: ImageRow[]; jobs: JobRow[] };
export type StudioConfig = { filaments: FilamentCatalog; marketplaces: Record<string, Marketplace> };

/** Everything a tab needs: data, a reloader and a way to open the full-size preview. */
export type TabProps = {
  product: Product;
  config: StudioConfig;
  reload: () => Promise<void>;
  preview: (rel: string) => void;
  goTo: (tab: TabId) => void;
};

export const TABS = [
  { id: "refs", label: "1. Referências" },
  { id: "generate", label: "2. Gerar" },
  { id: "candidates", label: "3. Candidatas" },
  { id: "export", label: "4. Aprovadas & exportar" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export function alertError(e: unknown) {
  // Shown by <ErrorBanner /> at the top of the product page.
  console.error(e);
  window.dispatchEvent(new CustomEvent("studio:error", { detail: (e as Error).message }));
}

/** Small selectable thumbnail used by the generate and export tabs. */
export function Thumb({
  slug,
  image,
  selected,
  onClick,
  size = 160,
  children,
}: {
  slug: string;
  image: ImageRow;
  selected?: boolean;
  onClick?: () => void;
  size?: number;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={`group relative overflow-hidden ${onClick ? "cursor-pointer" : ""} ${
        selected ? "ring-2 ring-orange-500 ring-offset-1" : ""
      }`}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fileUrl(slug, image.rel, 400)} alt="" style={{ height: size }} className="w-full bg-stone-100 object-contain" />
      {selected && <span className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-orange-500 text-xs text-white">✓</span>}
      {children}
    </Card>
  );
}

export function ErrorBanner() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMsg((e as CustomEvent<string>).detail);
    window.addEventListener("studio:error", on);
    return () => window.removeEventListener("studio:error", on);
  }, []);
  if (!msg) return null;
  return (
    <p className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {msg}
      <button onClick={() => setMsg(null)} className="text-red-400 hover:text-red-700">
        ✕
      </button>
    </p>
  );
}
