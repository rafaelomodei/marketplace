import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { Icon, Spinner } from "@/components/ui";
import { fileUrl } from "@/lib/client/api";
import type { ProductSummary } from "@/lib/products";
import { nextStep, stateFromSummary } from "@/lib/workflow";
import { ProductStatus } from "./ProductStatus";

export function ProductCard({ product }: { product: ProductSummary }) {
  const next = nextStep(stateFromSummary(product));
  return (
    <Link href={`/products/${product.slug}`} className="group block space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-surface ring-1 ring-line ring-inset transition group-hover:shadow-lift">
        {product.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(product.slug, product.cover, 560)} alt="" className="size-full object-cover transition duration-700 group-hover:scale-[1.03]" />
        ) : (
          <div className="grid size-full place-items-center text-ink-faint">
            <Icon icon={ImageIcon} className="size-8" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <ProductStatus next={next} />
        </div>
      </div>
      <div className="space-y-0.5 px-0.5">
        <div className="flex items-center gap-2 font-medium tracking-[-0.01em] text-ink-strong">
          <span className="truncate">{product.name}</span>
          {product.activeJobs > 0 && <Spinner className="size-3.5 text-warning" />}
        </div>
        <p className="truncate text-sm text-ink-muted">
          {product.counts.real} fotos · {product.counts.approved} aprovadas{product.counts.export ? ` · ${product.counts.export} arquivos` : ""}
        </p>
      </div>
    </Link>
  );
}
