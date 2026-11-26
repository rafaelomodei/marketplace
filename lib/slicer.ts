import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { HttpError } from "./products";
import { readSettings, writeSettings } from "./settings";

/**
 * The slicer installed on this machine (Creality Print by default, OrcaSlicer as fallback): opening a 3MF to
 * print, and slicing it in the background to read filament grams and print time.
 */

export const slicerSettingsSchema = z.object({
  /** Full path to the slicer program (e.g. the Creality Print AppImage). Empty = find it automatically. */
  path: z.string().trim().default(""),
});
export const getSlicerSettings = () => readSettings("slicer", slicerSettingsSchema);
export const setSlicerSettings = (input: unknown) => writeSettings("slicer", slicerSettingsSchema, input);

export type Slicer = { command: string; args: string[]; label: string; path: string };

const APPIMAGE = /^(CrealityPrint|OrcaSlicer|Bambu_?Studio).*\.AppImage$/i;
const SEARCH_DIRS = ["Documentos/programs", "Documentos/programas", "Documents/programs", "Applications", "AppImages", "Programas", "Downloads", "."];
const ORCA_FLATPAK = ["/var/lib/flatpak/app/com.orcaslicer.OrcaSlicer", path.join(os.homedir(), ".local/share/flatpak/app/com.orcaslicer.OrcaSlicer")];

const label = (file: string) => path.basename(file).replace(/\.AppImage$/i, "").replace(/[-_]x86_64.*$/i, "").replace(/[-_]/g, " ");

/** The configured slicer, else the newest Creality Print/Orca AppImage found in the usual folders, else Orca via flatpak. */
export function findSlicer(): Slicer | null {
  const configured = getSlicerSettings().path;
  if (configured && fs.existsSync(configured)) return { command: configured, args: [], label: label(configured), path: configured };
  const found = SEARCH_DIRS.flatMap((d) => {
    const dir = path.join(os.homedir(), d);
    try { return fs.readdirSync(dir).filter((f) => APPIMAGE.test(f)).map((f) => path.join(dir, f)); } catch { return []; }
  })
    // Creality Print first (the main slicer), then the most recent file.
    .sort((a, b) => Number(/creality/i.test(path.basename(b))) - Number(/creality/i.test(path.basename(a))) || fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (found[0]) return { command: found[0], args: [], label: label(found[0]), path: found[0] };
  if (ORCA_FLATPAK.some((d) => fs.existsSync(d))) return { command: "flatpak", args: ["run", "com.orcaslicer.OrcaSlicer"], label: "OrcaSlicer", path: "flatpak com.orcaslicer.OrcaSlicer" };
  return null;
}

function requireSlicer(): Slicer {
  const s = findSlicer();
  if (!s) throw new HttpError(400, "Não encontrei o fatiador. Informe onde está o Creality Print em Configurações.");
  return s;
}

/** Opens a file in the slicer's window, with the settings saved in it, ready to send to the printer. */
export async function openInSlicer(file: string): Promise<{ slicer: string }> {
  const s = requireSlicer();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(s.command, [...s.args, file], { detached: true, stdio: "ignore" });
    child.once("spawn", () => (child.unref(), resolve()));
    child.once("error", reject);
  }).catch(() => {
    throw new HttpError(500, `Não foi possível abrir o ${s.label}`);
  });
  return { slicer: s.label };
}

// ------------------------------------------------------------------------------------------------ slice statistics

export type PlateStats = { plate: number; grams: number[]; seconds: number };
export type SliceStats = {
  plates: PlateStats[];
  /** Grams per filament slot, all plates together (slots match `filaments`). */
  grams: number[];
  seconds: number;
  printer: string | null;
  filaments: { type: string; color: string; settingsId: string; costPerKg: number }[];
  slicer: string;
};

/** "1d 2h 5m 32s" → seconds. */
export function parseDuration(text: string): number {
  let s = 0;
  for (const [, n, u] of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) s += Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[u as "d"];
  return Math.round(s);
}

const line = (g: string, key: string) => g.match(new RegExp(`^; ?${key.replace(/[[\]()]/g, "\\$&")} = (.*)$`, "m"))?.[1]?.trim();
const values = (v: string | undefined, sep: RegExp) => (v ? v.split(sep).map((x) => x.trim().replace(/^"|"$/g, "")) : []);

/** Statistics written by Creality Print / OrcaSlicer at the end of a G-code file. */
export function parseGcodeStats(gcode: string, plate = 1) {
  const grams = values(line(gcode, "filament used [g]"), /,/).map(Number).filter(Number.isFinite);
  const time = line(gcode, "estimated printing time (normal mode)") ?? line(gcode, "model printing time") ?? "";
  const types = values(line(gcode, "filament_type"), /;/);
  const colors = values(line(gcode, "filament_colour"), /;/);
  const ids = values(line(gcode, "filament_settings_id"), /;/);
  const costs = values(line(gcode, "filament_cost"), /[;,]/).map(Number);
  const slots = Math.max(grams.length, types.length);
  return {
    stats: { plate, grams, seconds: parseDuration(time) } satisfies PlateStats,
    printer: line(gcode, "printer_settings_id")?.replace(/^"|"$/g, "") ?? null,
    filaments: Array.from({ length: slots }, (_, i) => ({ type: types[i] ?? "", color: colors[i] ?? "#cccccc", settingsId: ids[i] ?? types[i] ?? "", costPerKg: costs[i] || 0 })),
  };
}

/** The end of a (possibly huge) G-code file, where the statistics and settings are. */
function readTail(file: string, bytes = 3 * 1024 * 1024): string {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, bytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/** Slices every plate of a 3MF with its own settings, in the background (no window), and reads the statistics. */
export async function sliceFile(file: string, timeoutMs = 10 * 60_000): Promise<SliceStats> {
  const s = requireSlicer();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "studio-slice-"));
  try {
    const log = await new Promise<string>((resolve, reject) => {
      let text = "";
      const child = spawn(s.command, [...s.args, "--slice", "0", "--outputdir", out, file], { stdio: ["ignore", "pipe", "pipe"] });
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      const keep = (d: Buffer) => (text = (text + d.toString()).slice(-4000));
      child.stdout.on("data", keep);
      child.stderr.on("data", keep);
      child.once("error", (e) => (clearTimeout(timer), reject(e)));
      child.once("close", () => (clearTimeout(timer), resolve(text)));
    });
    let result: { return_code?: number; error_string?: string } = {};
    try { result = JSON.parse(fs.readFileSync(path.join(out, "result.json"), "utf8")); } catch { /* old slicers write no result.json */ }
    const gcodes = fs.readdirSync(out).filter((f) => /^plate_\d+\.gcode$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
    if (!gcodes.length || (result.return_code ?? 0) !== 0) {
      const reason = result.error_string && result.error_string !== "Success." ? result.error_string : log.split("\n").filter(Boolean).slice(-3).join(" ");
      throw new Error(`O fatiador não gerou o arquivo${reason ? `: ${reason}` : ""}`);
    }
    const parsed = gcodes.map((g) => parseGcodeStats(readTail(path.join(out, g)), parseInt(g.slice(6))));
    const slots = Math.max(...parsed.map((p) => p.filaments.length));
    const grams = Array.from({ length: slots }, (_, i) => parsed.reduce((n, p) => n + (p.stats.grams[i] ?? 0), 0));
    return {
      plates: parsed.map((p) => p.stats),
      grams: grams.map((g) => Math.round(g * 100) / 100),
      seconds: parsed.reduce((n, p) => n + p.stats.seconds, 0),
      printer: parsed[0].printer,
      filaments: parsed.find((p) => p.filaments.length === slots)!.filaments,
      slicer: s.label,
    };
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}
