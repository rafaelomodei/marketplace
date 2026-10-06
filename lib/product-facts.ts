import { z } from "zod";

const decimal = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return Number(trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed);
  }
  return value;
}, z.number().finite().positive());
const optionalText = z.string().trim().min(1).optional();
const dimensions = z.object({ height: decimal.optional(), width: decimal.optional(), length: decimal.optional(), unit: z.enum(["mm", "cm", "m"]) }).refine((value) => value.height || value.width || value.length, "Informe ao menos uma medida");

/** Seller-confirmed facts only. Optional fields let old products and incomplete forms stay valid. */
export const productFactsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  identification: z.object({ internalName: optionalText, family: optionalText, itemType: optionalText, brand: optionalText, sku: optionalText, material: optionalText, finish: optionalText, colors: z.array(z.string().trim().min(1)).optional(), filamentIds: z.array(z.string().trim().min(1)).optional(), dimensions: dimensions.optional() }).default({}),
  purchase: z.object({ pieces: z.number().int().positive().optional(), included: z.array(z.object({ name: z.string().trim().min(1), quantity: z.number().int().positive() })).optional(), notIncluded: z.array(z.string().trim().min(1)).optional(), assembly: optionalText }).default({}),
  personalization: z.object({ accepted: z.boolean().optional(), fields: z.array(z.string().trim().min(1)).optional(), optionsAndLimits: optionalText, buyerInstructions: optionalText }).default({}),
  sale: z.object({ priceBRL: decimal.optional(), stock: z.number().int().nonnegative().optional(), fulfillment: z.enum(["ready", "made_to_order"]).optional(), preparationDays: z.number().int().positive().optional(), productionCapacity: z.number().int().positive().optional() }).default({}),
  shipping: z.object({ grossWeight: z.object({ value: decimal, unit: z.enum(["g", "kg"]) }).optional(), packageDimensions: dimensions.optional() }).default({}),
  care: z.object({ purpose: optionalText, cleaning: optionalText, limitations: optionalText, printedFinishNotes: optionalText }).default({}),
  variations: z.array(z.object({ id: z.string().trim().min(1), values: z.object({ color: optionalText, size: optionalText, kitQuantity: z.number().int().positive().optional() }).default({}), sku: optionalText, priceBRL: decimal.optional(), stock: z.number().int().nonnegative().optional(), imageId: z.number().int().positive().optional() })).optional(),
}).superRefine((facts, ctx) => {
  const ids = new Set<string>(); const skus = new Set<string>();
  for (const [index, variation] of (facts.variations ?? []).entries()) {
    if (ids.has(variation.id)) ctx.addIssue({ code: "custom", path: ["variations", index, "id"], message: "Identificador de variação duplicado" });
    ids.add(variation.id);
    if (variation.sku) { if (skus.has(variation.sku)) ctx.addIssue({ code: "custom", path: ["variations", index, "sku"], message: "SKU de variação duplicado" }); skus.add(variation.sku); }
  }
});
export type ProductFacts = z.output<typeof productFactsSchema>;

export const REQUIRED_FACT_KEYS = [
  "identification.itemType",
  "identification.material",
  "purchase.included",
  "sale.priceBRL",
  "sale.stock",
  "shipping.grossWeight",
  "shipping.packageDimensions",
] as const;

/** The single readiness definition shared by the UI and server-side completion checks. */
export function missingRequiredFacts(facts: ProductFacts) {
  const missing: { key: string; label: string }[] = [];
  if (!facts.identification.itemType) missing.push({ key: "identification.itemType", label: "tipo do item" });
  if (!facts.identification.material) missing.push({ key: "identification.material", label: "material confirmado" });
  if (!facts.purchase.included?.length) missing.push({ key: "purchase.included", label: "conteúdo da compra" });
  if (!facts.sale.priceBRL) missing.push({ key: "sale.priceBRL", label: "preço" });
  if (facts.sale.stock === undefined && facts.sale.fulfillment !== "made_to_order") missing.push({ key: "sale.stock", label: "estoque ou produção sob encomenda" });
  if (!facts.shipping.grossWeight) missing.push({ key: "shipping.grossWeight", label: "peso bruto do pacote" });
  if (!facts.shipping.packageDimensions) missing.push({ key: "shipping.packageDimensions", label: "dimensões externas da embalagem" });
  return missing;
}
