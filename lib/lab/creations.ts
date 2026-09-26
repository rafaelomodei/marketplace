import crypto from "node:crypto";
import { db, now } from "../db";
import { HttpError, locateProduct } from "../products";
import { creationName, MAX_CREATION_NAME } from "./naming";
import type { ParamValues } from "./params";
import { findTool } from "./tools";
import type { LabTool } from "./types";

/** Color picked for a part: a real filament, or just a hex. Same shape as the editor's PartColor. */
export type CreationColor = { filamentId: string | null; hex: string };

/** Something made with a Lab tool, saved so it can be reopened later (the tool's history). */
/**
 * `customName`: renamed by someone (otherwise the name follows the values, see creationName).
 * `product`: the Studio product made from it ("Gerar mockup"), while it exists.
 */
export type LabCreationSummary = {
  id: string;
  tool: string;
  name: string;
  customName: boolean;
  product: string | null;
  hasThumbnail: boolean;
  createdAt: string;
  updatedAt: string;
};
export type LabCreation = LabCreationSummary & { values: ParamValues; colors: Record<string, CreationColor> };

type Row = {
  id: string;
  tool: string;
  name: string;
  custom_name: number;
  product: string | null;
  values: string;
  colors: string;
  has_thumbnail: number;
  created_at: string;
  updated_at: string;
};

const COLUMNS = `id, tool, name, custom_name, product, "values", colors, thumbnail IS NOT NULL AS has_thumbnail, created_at, updated_at`;

const summary = (r: Row): LabCreationSummary => ({
  id: r.id,
  tool: r.tool,
  name: r.name,
  customName: !!r.custom_name,
  product: r.product && locateProduct(r.product) ? r.product : null,
  hasThumbnail: !!r.has_thumbnail,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function readyTool(id: string): LabTool {
  const tool = findTool(id);
  if (!tool || tool.status !== "ready") throw new HttpError(404, `Ferramenta do Lab não encontrada: ${id}`);
  return tool;
}

export { creationName } from "./naming";

/** Most recently edited first. */
export function listCreations(tool?: string): LabCreationSummary[] {
  const rows = tool
    ? db().prepare(`SELECT ${COLUMNS} FROM lab_creations WHERE tool = ? ORDER BY updated_at DESC, rowid DESC`).all(tool)
    : db().prepare(`SELECT ${COLUMNS} FROM lab_creations ORDER BY updated_at DESC, rowid DESC`).all();
  return (rows as Row[]).map(summary);
}

export function findCreation(id: string): LabCreation | null {
  const r = db().prepare(`SELECT ${COLUMNS} FROM lab_creations WHERE id = ?`).get(id) as Row | undefined;
  return r ? { ...summary(r), values: JSON.parse(r.values), colors: JSON.parse(r.colors) } : null;
}

export function getCreation(id: string): LabCreation {
  const found = findCreation(id);
  if (!found) throw new HttpError(404, `Criação não encontrada: ${id}`);
  return found;
}

/** Picture of the piece (WebP/PNG/JPEG), or null. */
export function creationThumbnail(id: string): Buffer | null {
  const r = db().prepare("SELECT thumbnail FROM lab_creations WHERE id = ?").get(id) as { thumbnail: Buffer | null } | undefined;
  return r?.thumbnail ?? null;
}

/** Image data URL sent by the editor → bytes to store (only small raster images). */
function thumbnailBytes(dataUrl: string): Buffer {
  const m = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, "Miniatura inválida: envie uma imagem WebP, PNG ou JPEG em data URL");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 512_000) throw new HttpError(400, "Miniatura grande demais (máx. 500 KB)");
  return bytes;
}

/** A name typed by someone, or null to go back to the automatic one. */
const typedName = (name: string | null) => name?.trim().slice(0, MAX_CREATION_NAME) || null;

/**
 * Creates (no id) or updates a creation. Values are saved as they are, even with a problem the editor is showing:
 * it is work in progress. The thumbnail is kept when not sent. `name`: a name typed by someone, null for the automatic
 * one (see creationName), or omitted to keep the current choice.
 */
export function saveCreation(input: {
  id?: string;
  tool: string;
  values: ParamValues;
  colors?: Record<string, CreationColor>;
  thumbnail?: string | null;
  name?: string | null;
}): LabCreationSummary {
  const tool = readyTool(input.tool);
  const current = input.id ? getCreation(input.id) : null;
  if (current && current.tool !== tool.id) throw new HttpError(400, `A criação ${input.id} é de outra ferramenta (${current.tool})`);
  const typed = input.name === undefined ? (current?.customName ? current.name : null) : typedName(input.name);
  const name = typed ?? creationName(tool, input.values);
  const thumb = input.thumbnail ? thumbnailBytes(input.thumbnail) : null;
  const at = now();
  const values = JSON.stringify(input.values);
  const colors = JSON.stringify(input.colors ?? {});

  if (current) {
    db()
      .prepare(`UPDATE lab_creations SET name = ?, custom_name = ?, "values" = ?, colors = ?, thumbnail = COALESCE(?, thumbnail), updated_at = ? WHERE id = ?`)
      .run(name, typed ? 1 : 0, values, colors, thumb, at, current.id);
    return summary(db().prepare(`SELECT ${COLUMNS} FROM lab_creations WHERE id = ?`).get(current.id) as Row);
  }

  const id = crypto.randomBytes(6).toString("base64url");
  db()
    .prepare(
      `INSERT INTO lab_creations (id, tool, name, custom_name, "values", colors, thumbnail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, tool.id, name, typed ? 1 : 0, values, colors, thumb, at, at);
  return { id, tool: tool.id, name, customName: !!typed, product: null, hasThumbnail: !!thumb, createdAt: at, updatedAt: at };
}

/** New name typed in the history or the editor; empty goes back to the automatic name. Values are untouched. */
export function renameCreation(id: string, name: string | null): LabCreationSummary {
  const c = getCreation(id);
  return saveCreation({ id, tool: c.tool, values: c.values, colors: c.colors, name });
}

/** A copy to try variations without losing the original. */
export function duplicateCreation(id: string): LabCreationSummary {
  const c = getCreation(id);
  const copy = saveCreation({ tool: c.tool, values: c.values, colors: c.colors, name: c.customName ? `${c.name} (cópia)` : null });
  db().prepare("UPDATE lab_creations SET thumbnail = (SELECT thumbnail FROM lab_creations WHERE id = ?) WHERE id = ?").run(id, copy.id);
  return { ...copy, hasThumbnail: c.hasThumbnail };
}

/** Links a creation to the Studio product made from it. */
export function linkProduct(id: string, product: string) {
  db().prepare("UPDATE lab_creations SET product = ? WHERE id = ?").run(product, id);
}

export function deleteCreation(id: string) {
  getCreation(id);
  db().prepare("DELETE FROM lab_creations WHERE id = ?").run(id);
  return { ok: true };
}
