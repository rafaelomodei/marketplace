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
export function getCodexSettings(): CodexSettings {
  const target = file();
  if (!fs.existsSync(target)) return { model: "gpt-6-luna" };
  try { return codexSettingsSchema.parse(JSON.parse(fs.readFileSync(target, "utf8")).codex); }
  catch { return { model: "gpt-6-luna" }; }
}
export function setCodexSettings(input: unknown) {
  const settings = codexSettingsSchema.parse(input);
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let current: Record<string, unknown> = {};
  if (fs.existsSync(target)) { try { current = JSON.parse(fs.readFileSync(target, "utf8")); } catch { /* replace malformed settings safely */ } }
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...current, codex: settings }, null, 2) + "\n");
  fs.renameSync(tmp, target);
  return settings;
}
