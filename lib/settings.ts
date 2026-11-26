import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DATA_DIR } from "./paths";

export const CODEX_MODELS = [
  { id: "gpt-6-luna", name: "GPT-6 Luna", detail: "Mais econômico; bom para tarefas frequentes" },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", detail: "Mais capacidade para instruções complexas" },
  { id: "gpt-6-astra", name: "GPT-6 Astra", detail: "Maior capacidade" },
] as const;
export const codexSettingsSchema = z.object({ model: z.enum(["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"]).default("gpt-6-luna") });
export type CodexSettings = z.infer<typeof codexSettingsSchema>;

const file = () => path.join(DATA_DIR, "settings.json");

function readAll(): Record<string, unknown> {
  const target = file();
  if (!fs.existsSync(target)) return {};
  try { return JSON.parse(fs.readFileSync(target, "utf8")); }
  catch { return {}; /* replace malformed settings safely */ }
}

/** One section of data/settings.json, validated; falls back to the schema defaults when missing or invalid. */
export function readSettings<S extends z.ZodType>(key: string, schema: S): z.output<S> {
  const parsed = schema.safeParse(readAll()[key] ?? {});
  return parsed.success ? parsed.data : schema.parse({});
}

/** Validates and saves one section, keeping the others. */
export function writeSettings<S extends z.ZodType>(key: string, schema: S, input: unknown): z.output<S> {
  const value = schema.parse(input);
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...readAll(), [key]: value }, null, 2) + "\n");
  fs.renameSync(tmp, target);
  return value;
}

export const getCodexSettings = (): CodexSettings => readSettings("codex", codexSettingsSchema);
export const setCodexSettings = (input: unknown) => writeSettings("codex", codexSettingsSchema, input);
