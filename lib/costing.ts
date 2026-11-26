import { z } from "zod";
import { readSettings, writeSettings } from "./settings";

/**
 * Cost and suggested price of a print — the same formula as the "Calculadora de Preço" of the Verde Forma
 * spreadsheet: materials + energy + labour + machine wear + extras; price = cost ÷ (1 − margin) for a direct sale.
 * A print that yields several objects (9 ornaments on one plate) splits filament, energy and machine among them;
 * extras and labour are per object.
 */

const money = z.number().nonnegative();
export const printerSchema = z.object({
  /** Part of the slicer's printer profile name that identifies this printer, e.g. "Ender-3 V3". */
  match: z.string().trim().min(1),
  name: z.string().trim().min(1),
  powerW: z.number().positive(),
  /** Wear and maintenance reserve per printing hour. */
  machinePerHour: money,
});
export type Printer = z.infer<typeof printerSchema>;

export const costSettingsSchema = z.object({
  energyPerKwh: money.default(1.056681),
  laborPerHour: money.default(20),
  /** Assembly, finishing and packing time of one piece. */
  laborMinutes: money.default(1),
  /** Extra filament for failures and purge, as a fraction (0.1 = 10%). */
  waste: z.number().min(0).max(1).default(0),
  /** Profit share of the selling price (0.5 = 50%). */
  margin: z.number().min(0).max(0.95).default(0.5),
  /** Price of a filament type not in `filaments`. */
  filamentPerKg: money.default(120),
  /** Price per kg of each filament type (PLA, PETG…). The Studio is the source of truth: slicer profiles often keep a placeholder price. */
  filaments: z.array(z.object({ type: z.string().trim().min(1), perKg: money })).default([{ type: "PLA", perKg: 120 }, { type: "PETG", perKg: 120 }]),
  /** Use the price saved in the slicer's filament profile instead of the table above. */
  useSlicerPrice: z.boolean().default(false),
  printers: z.array(printerSchema).default([{ match: "Ender-3 V3", name: "Ender-3 V3", powerW: 350, machinePerHour: 2 }]),
  /** Any printer not in the list. */
  otherPrinter: z.object({ powerW: z.number().positive(), machinePerHour: money }).default({ powerW: 350, machinePerHour: 2 }),
});
export type CostSettings = z.infer<typeof costSettingsSchema>;
export const getCostSettings = () => readSettings("cost", costSettingsSchema);
export const setCostSettings = (input: unknown) => writeSettings("cost", costSettingsSchema, input);

export const extraSchema = z.object({ name: z.string().trim().min(1), quantity: z.number().positive(), unitCost: money });
export type Extra = z.infer<typeof extraSchema>;

export type CostInput = {
  grams: number[];
  /** Filament type of each slot (PLA, PETG…). */
  types?: string[];
  /** R$/kg of each slot saved in the slicer profile; used only when `useSlicerPrice` is on. */
  costPerKg: number[];
  seconds: number;
  printer: string | null;
  /** Extras of ONE finished object. */
  extras?: Extra[];
  /** Hands-on minutes of ONE finished object. */
  laborMinutes?: number;
  /** How many finished objects this print yields (9 ornaments on the plate = 9). Default 1. */
  units?: number;
};
/** Cost of ONE finished object (the print split by `units`, plus its own extras and labour) and of the whole print. */
export type CostBreakdown = {
  /** Finished objects the print yields. */
  units: number;
  /** Filament + energy + machine of the whole print. */
  printTotal: number;
  /** Everything for all `units` objects (print + extras and labour of each). */
  batchTotal: number;
  material: number;
  /** R$/kg used for each filament slot. */
  filamentPerKg: number[];
  energy: number;
  labor: number;
  machine: number;
  extras: number;
  total: number;
  price: number;
  printer: string;
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function findPrinter(profile: string | null, s: CostSettings) {
  const p = profile ? s.printers.find((x) => profile.toLowerCase().includes(x.match.toLowerCase())) : undefined;
  return p ?? { name: profile?.replace(/\s*\d+(\.\d+)?\s*nozzle$/i, "") || "Outra impressora", ...s.otherPrinter };
}

/** R$/kg of one filament slot: slicer profile (when enabled), else the Studio table by type, else the default. */
export function filamentPrice(type: string | undefined, slicerPerKg: number, s: CostSettings) {
  if (s.useSlicerPrice && slicerPerKg > 0) return slicerPerKg;
  const t = (type ?? "").trim().toLowerCase();
  return s.filaments.find((f) => f.type.toLowerCase() === t)?.perKg ?? s.filamentPerKg;
}

export function computeCost(input: CostInput, s: CostSettings = getCostSettings()): CostBreakdown {
  const hours = input.seconds / 3600;
  const printer = findPrinter(input.printer, s);
  const perKg = input.grams.map((_, i) => filamentPrice(input.types?.[i], input.costPerKg[i] ?? 0, s));
  const units = Math.max(1, Math.round(input.units ?? 1));
  const printMaterial = input.grams.reduce((n, g, i) => n + (g * perKg[i]) / 1000, 0) * (1 + s.waste);
  const printEnergy = hours * (printer.powerW / 1000) * s.energyPerKwh;
  const printMachine = hours * printer.machinePerHour;
  const [material, energy, machine] = [printMaterial / units, printEnergy / units, printMachine / units];
  const labor = ((input.laborMinutes ?? s.laborMinutes) / 60) * s.laborPerHour;
  const extras = (input.extras ?? []).reduce((n, e) => n + e.quantity * e.unitCost, 0);
  const total = material + energy + labor + machine + extras;
  return {
    units,
    printTotal: cents(printMaterial + printEnergy + printMachine),
    batchTotal: cents(total * units),
    material: cents(material),
    filamentPerKg: perKg,
    energy: cents(energy),
    labor: cents(labor),
    machine: cents(machine),
    extras: cents(extras),
    total: cents(total),
    price: cents(total / (1 - s.margin)),
    printer: printer.name,
  };
}

/**
 * Cost of ONE finished object made from several prints (a body and a different base printed apart): adds the
 * filament, energy and machine of each part (already per object) and counts labour and extras once.
 * `extraMaterial` is the surcharge of a pricier filament colour (see `colorSurcharge`).
 */
export function combineCosts(parts: CostBreakdown[], s: CostSettings = getCostSettings(), extraMaterial = 0): CostBreakdown {
  if (!parts.length) throw new Error("combineCosts: nenhuma parte");
  const sum = (k: "material" | "energy" | "machine") => parts.reduce((n, p) => n + p[k], 0);
  const [material, energy, machine] = [sum("material") + extraMaterial, sum("energy"), sum("machine")];
  const { labor, extras } = parts[0];
  const total = material + energy + machine + labor + extras;
  return {
    units: 1,
    printTotal: cents(parts.reduce((n, p) => n + p.printTotal, 0) + extraMaterial),
    batchTotal: cents(total),
    material: cents(material),
    filamentPerKg: parts.flatMap((p) => p.filamentPerKg),
    energy: cents(energy),
    labor,
    machine: cents(machine),
    extras,
    total: cents(total),
    price: cents(total / (1 - s.margin)),
    printer: parts[0].printer,
  };
}

/**
 * Extra filament cost of printing in a colour whose 1 kg roll costs `perKg` instead of what each slot was priced
 * at (`slotPerKg`, as in CostBreakdown.filamentPerKg). `grams` are per finished object. Negative = cheaper.
 */
export function colorSurcharge(grams: number[], slotPerKg: number[], perKg: number, s: CostSettings = getCostSettings()) {
  return cents(grams.reduce((n, g, i) => n + (g * (perKg - (slotPerKg[i] ?? perKg))) / 1000, 0) * (1 + s.waste));
}
