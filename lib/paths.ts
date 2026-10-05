import path from "node:path";
import os from "node:os";

export const ROOT = path.resolve(process.env.STUDIO_ROOT ?? process.cwd());
export const PRODUCTS_DIR = path.join(ROOT, "products");
export const DATA_DIR = path.join(ROOT, "data");
export const CONFIG_DIR = path.join(ROOT, "config");
export const SKILL_FILE = path.join(ROOT, "skills", "marketplace-product-image", "SKILL.md");
export const CODEX_BIN = process.env.CODEX_BIN ?? "codex";
export const CODEX_HOME = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");

export const STAGES = ["create", "ready"] as const;
export type Stage = (typeof STAGES)[number];

/** Subfolder of a product that holds each kind of image. */
export const SUBDIRS = {
  real: "real",
  style: "style-refs",
  generated: "generated",
  approved: "approved",
  export: "exports",
} as const;
export type ImageKind = keyof typeof SUBDIRS;

export const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
