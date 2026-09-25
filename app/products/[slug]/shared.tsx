import type { FilamentCatalog, Marketplace } from "@/lib/config";
import type { ProductDetail } from "@/lib/products";
import type { StepId } from "@/lib/workflow";

export type StudioConfig = { filaments: FilamentCatalog; marketplaces: Record<string, Marketplace> };

/** Everything a step needs: data, a reloader, the full-size preview and navigation. */
export type StepProps = {
  product: ProductDetail;
  config: StudioConfig;
  reload: () => Promise<void>;
  preview: (rel: string) => void;
  goTo: (step: StepId) => void;
};
