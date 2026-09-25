import { z } from "zod";
import { LAB_FONTS, LAB_ICONS } from "./fonts";

/**
 * Parameters of a parametric Lab tool. One list drives the form (UI), the OpenSCAD `-D` flags
 * and the zod schema used by actions (future MCP tools).
 */
type Base = {
  id: string;
  label: string;
  hint?: string;
  /** Section of the form (e.g. "Texto", "Argola"). */
  group: string;
  /** Hidden under "Ajustes finos" — most people never need it. */
  advanced?: boolean;
  showIf?: Condition;
};

/**
 * When a param (or an option) is shown: another param is set (text filled in, choice not "none"),
 * or has a given value. Plain data, so it survives JSON (list_lab_tools).
 */
export type Condition = string | { param: string; equals: string };
export type Option = { value: string; label: string; showIf?: Condition };

export type Param =
  | (Base & { type: "text"; default: string; maxLength: number; placeholder?: string })
  | (Base & { type: "number"; default: number; min: number; max: number; step: number; unit?: string })
  | (Base & { type: "choice"; default: string; options: Option[] })
  /** Several options at once; the value is a comma-separated list ("text,icon"). */
  | (Base & { type: "multi"; default: string; options: Option[] })
  | (Base & { type: "font"; default: string })
  /** One of LAB_ICONS by id, or "none". */
  | (Base & { type: "icon"; default: string });

export type ParamValues = Record<string, string | number>;

export const defaultValues = (params: Param[]): ParamValues => Object.fromEntries(params.map((p) => [p.id, p.default]));

/** A param is "set" when its text is not empty and its choice is not "none". */
export const isSet = (v: string | number | undefined) => v !== undefined && v !== "none" && String(v).trim() !== "";

export const meets = (c: Condition | undefined, values: ParamValues) =>
  !c || (typeof c === "string" ? isSet(values[c]) : String(values[c.param]) === c.equals);

export const visibleParams = (params: Param[], values: ParamValues) => params.filter((p) => meets(p.showIf, values));
export const visibleOptions = (options: Option[], values: ParamValues) => options.filter((o) => meets(o.showIf, values));

export const listValue = (v: string | number | undefined) => String(v ?? "").split(",").filter(Boolean);

/** OpenSCAD literal for a value (strings are quoted and escaped). */
const literal = (v: string | number) => (typeof v === "number" ? String(v) : JSON.stringify(v));

export function scadDefines(values: ParamValues): string[] {
  return Object.entries(values).flatMap(([k, v]) => ["-D", `${k}=${literal(v)}`]);
}

export function paramsSchema(params: Param[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const p of params) {
    const base: z.ZodType =
      p.type === "text"
        ? z.string().max(p.maxLength)
        : p.type === "number"
          ? z.number().min(p.min).max(p.max)
          : p.type === "choice"
            ? z.enum(p.options.map((o) => o.value) as [string, ...string[]])
            : p.type === "multi"
              ? z.string().refine((v) => listValue(v).every((x) => p.options.some((o) => o.value === x)), "opção inválida")
            : p.type === "font"
              ? z.enum(LAB_FONTS.map((f) => f.family) as [string, ...string[]])
              : z.enum(["none", ...LAB_ICONS.map((i) => i.id)] as [string, ...string[]]);
    shape[p.id] = z.optional(base).default(p.default as never).describe(p.hint ? `${p.label}. ${p.hint}` : p.label);
  }
  return z.object(shape);
}
