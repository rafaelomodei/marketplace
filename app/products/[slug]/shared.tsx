import type { FilamentCatalog, Marketplace } from "@/lib/config";
import type { CODEX_MODELS, CodexSettings } from "@/lib/settings";
import type { ProductDetail } from "@/lib/products";
import type { StepId } from "@/lib/workflow";

export type StudioConfig = { filaments: FilamentCatalog; marketplaces: Record<string, Marketplace>; codex: CodexSettings & { models: typeof CODEX_MODELS } };

/** Everything a step needs: data, a reloader, the full-size preview and navigation. */
export type StepProps = {
  product: ProductDetail;
  config: StudioConfig;
  reload: () => Promise<void>;
  preview: (rel: string) => void;
  goTo: (step: StepId) => void;
};
