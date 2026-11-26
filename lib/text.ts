/** Pure text helpers (safe to import in the browser). */

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "hoje, 14:32", "ontem, 09:10" or "12 de set." — when something was last changed. */
export function whenPtBr(iso: string, today = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  if (diff === 0) return `hoje, ${time}`;
  if (diff === 1) return `ontem, ${time}`;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }) });
}

/** 3932 → "1h 05min"; 300 → "5min". */
export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}min`;
}

/** 4.5 → "R$ 4,50". */
export const formatMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** 13.02 → "13 g"; 0.36 → "0,4 g". */
export const formatGrams = (g: number) => `${g.toLocaleString("pt-BR", { maximumFractionDigits: g < 10 ? 1 : 0 })} g`;

/** mm with up to one decimal: 12.5 → "12,5". */
export const formatMm = (mm: number) => mm.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Width × depth × height in mm → "68 × 68 × 75 mm". */
export const formatSize = (d: { width: number; depth: number; height: number }) => `${formatMm(d.width)} × ${formatMm(d.depth)} × ${formatMm(d.height)} mm`;

/** 1536000 → "1,5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

// ------------------------------------------------------------------------------------------- print file names

/** "Sagrada Família" → "sagradaFamilia" (no accents, first word lowercase, the others capitalised). */
export function camelName(name: string): string {
  return slugify(name)
    .split("-")
    .filter(Boolean)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w))
    .join("");
}

const PRINTER_BRANDS = /^(creality|bambu\s*lab|prusa(\s*research)?|anycubic|elegoo|flashforge|sovol|qidi|artillery)\s+/i;

/** Slicer printer profile → short tag for file names: "Creality K1 Max 0.4 nozzle" → "K1Max", "Ender-3 V3 KE" → "Ender3V3KE". */
export function printerTag(printer: string): string {
  return printer
    .replace(/\s*\(?\d+(\.\d+)?\s*(mm\s*)?nozzle\)?\s*$/i, "")
    .replace(PRINTER_BRANDS, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

/**
 * The library's file name pattern, without extension: the project name in camelCase and, for a 3MF configured
 * in the slicer, "_" + the printer — "vasoColmeia_K1Max". Copies get "-2", "-3"…
 */
export function standardFileBase(projectName: string, printer?: string | null): string {
  const base = camelName(projectName) || "arquivo";
  const tag = printer ? printerTag(printer) : "";
  return tag ? `${base}_${tag}` : base;
}

/** Whether a file name (with extension) already follows `standardFileBase`, copies ("-2") included. */
export function followsStandard(fileName: string, base: string): boolean {
  return fileName.replace(/\.[^.]+$/, "").replace(/-\d+$/, "") === base;
}
