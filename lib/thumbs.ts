import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR } from "./paths";

/** A JPEG thumbnail of an image file, `width` px wide (white behind transparency), cached by path, date and width. */
export async function jpegThumb(abs: string, width: number): Promise<Buffer> {
  const key = crypto.createHash("sha1").update(`${abs}:${fs.statSync(abs).mtimeMs}:${width}`).digest("hex");
  const thumb = path.join(DATA_DIR, "thumbs", `${key}.jpg`);
  if (!fs.existsSync(thumb)) {
    fs.mkdirSync(path.dirname(thumb), { recursive: true });
    await sharp(abs).rotate().flatten({ background: "#ffffff" }).resize({ width, withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumb);
  }
  return fs.readFileSync(thumb);
}
