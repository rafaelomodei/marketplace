import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Zip as ZipWriter, ZipDeflate } from "fflate";
import { z } from "zod";
import { DATA_DIR } from "./paths";
import { HttpError } from "./products";
import { readSettings, writeSettings } from "./settings";
import { Zip } from "./zip";

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
  /**
   * The model changes colour (painted on it, or per layer height) and the slicer crashed on that, so it was sliced
   * as a single colour: total
   * grams and time stay close, but the split per colour and the filament swaps are not counted.
   */
  paintIgnored?: boolean;
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

/**
 * Where the slicer writes its G-code while slicing: on disk, in the app's data folder. Not the system temp folder,
 * which is often kept in memory (tmpfs) — a detailed model makes a G-code of hundreds of MB.
 */
const sliceDir = () => {
  const dir = path.join(DATA_DIR, "slicing");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** Signs that the slicer itself crashed (its crash reporter then fails writing to "/log"). */
const CRASHED = /terminate called|core dumped|Segmentation fault|"\/log"/i;

/**
 * Slices every plate of a 3MF with its own settings, in the background (no window), and reads the statistics.
 * The slicer runs with low priority, so the computer (and the browser) stay responsive while it works.
 * Creality Print crashes slicing models that change colour (painted, or per layer) from the command line; those are
 * sliced again as a single colour (see `paintIgnored`).
 */
export async function sliceFile(file: string, timeoutMs = 10 * 60_000): Promise<SliceStats> {
  try {
    return await runSlicer(file, timeoutMs);
  } catch (err) {
    const crashed = CRASHED.test((err as Error).message);
    const plain = crashed ? path.join(sliceDir(), `sem-pintura-${process.pid}-${Date.now()}.3mf`) : null;
    try {
      if (plain && singleColorCopy(file, plain)) return { ...(await runSlicer(plain, timeoutMs)), paintIgnored: true };
    } finally {
      if (plain) fs.rmSync(plain, { force: true });
    }
    if (crashed) throw new Error("O Creality Print travou ao fatiar este arquivo. Abra no fatiador para conferir o modelo.");
    throw err;
  }
}

/** Colour changes at given layer heights ("tool_change"/"PAUSE" per plate), which also crash Creality Print's CLI. */
const LAYER_CHANGES = "Metadata/custom_gcode_per_layer.xml";

/**
 * Copies a 3MF as a single-colour model, one entry at a time: without its painted colours (`paint_color` on the
 * triangles) and without colour changes per layer. Returns false (and writes nothing) when it has neither.
 */
export function singleColorCopy(src: string, dst: string): boolean {
  const zip = new Zip(src);
  const NEEDLE = Buffer.from(' paint_color="');
  try {
    const models = zip.names().filter((n) => n.endsWith(".model"));
    const layerChanges = /<layer\b/.test(zip.text(LAYER_CHANGES) ?? "");
    if (!layerChanges && !models.some((n) => zip.read(n)?.includes(NEEDLE))) return false;
    const fd = fs.openSync(dst, "w");
    try {
      const out = new ZipWriter((e, chunk) => {
        if (e) throw e;
        fs.writeSync(fd, chunk);
      });
      for (const name of zip.names()) {
        if (name === LAYER_CHANGES) continue;
        let data = zip.read(name);
        if (!data) continue;
        if (name.endsWith(".model")) {
          const parts: Buffer[] = [];
          let from = 0;
          for (let i = data.indexOf(NEEDLE); i >= 0; i = data.indexOf(NEEDLE, from)) {
            parts.push(data.subarray(from, i));
            from = data.indexOf(0x22, i + NEEDLE.length) + 1;
          }
          if (parts.length) data = Buffer.concat([...parts, data.subarray(from)]);
        }
        const entry = new ZipDeflate(name, { level: 1 });
        out.add(entry);
        entry.push(data, true);
      }
      out.end();
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } finally {
    zip.close();
  }
}

async function runSlicer(file: string, timeoutMs: number): Promise<SliceStats> {
  const s = requireSlicer();
  const out = fs.mkdtempSync(path.join(sliceDir(), "slice-"));
  try {
    const log = await new Promise<string>((resolve, reject) => {
      let text = "";
      const child = spawn(s.command, [...s.args, "--slice", "0", "--outputdir", out, file], { stdio: ["ignore", "pipe", "pipe"] });
      if (child.pid) try { os.setPriority(child.pid, 15); } catch { /* not allowed: keeps normal priority */ }
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
