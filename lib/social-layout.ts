import type { SocialFormat } from "./prompts";

/**
 * Geometry of the social pieces: canvas sizes, fixed zones and how the generator's frame maps to
 * the canvas. Pure (no sharp/fs) because lib/prompts.ts, imported by the browser, uses it.
 */

export type Box = { left: number; top: number; width: number; height: number };

export const SOCIAL_CANVAS: Record<SocialFormat, { width: number; height: number }> = {
  "feed-portrait": { width: 1080, height: 1350 },
  "feed-square": { width: 1080, height: 1080 },
  vertical: { width: 1080, height: 1920 },
};

/** What the generator is asked for: the closest size it supports, center-cropped to the canvas afterwards. */
export const GENERATION_FRAME: Record<SocialFormat, { width: number; height: number }> = {
  "feed-portrait": { width: 1024, height: 1536 },
  "feed-square": { width: 1024, height: 1024 },
  vertical: { width: 1024, height: 1536 },
};

/** The texts of a piece, stored with the job so corrections redraw the same graphic layer. */
export type SocialDesign = { format: SocialFormat; headline?: string; supportingText?: string; cta?: string };

export const BRAND = {
  title: "#4F5732",
  emphasis: "#B07A48",
  body: "#4A4C3B",
  ctaFill: "#BC8756",
  ctaText: "#FAF8F3",
  veil: "#F6F0E7",
} as const;

export const MARGIN = 72;
export const CTA = { height: 66, pad: 34, size: 28, gap: 26, maxWidth: 440 };

/**
 * Fixed zones of every format (canvas px). Text column on the left, product on the right, footer
 * (CTA + signature) at the bottom left. Vertical keeps clear of the Stories/Reels interface bands.
 */
export function socialZones(format: SocialFormat): { text: Box; footer: Box; product: Box } {
  const { width: W, height: H } = SOCIAL_CANVAS[format];
  const top = format === "vertical" ? Math.round(H * 0.14) : format === "feed-square" ? 64 : 92;
  const bottom = format === "vertical" ? Math.round(H * 0.8) : H - (format === "feed-square" ? 52 : 60);
  const footerHeight = 170;
  const textWidth = format === "feed-square" ? 480 : 500;
  return {
    text: { left: MARGIN, top, width: textWidth, height: Math.round((bottom - footerHeight - top) * (format === "vertical" ? 0.55 : 0.62)) },
    footer: { left: MARGIN, top: bottom - footerHeight, width: CTA.maxWidth, height: footerHeight },
    product: format === "vertical"
      ? { left: Math.round(W * 0.54), top: Math.round(H * 0.3), width: Math.round(W * 0.38), height: Math.round(H * 0.5) }
      : { left: Math.round(W * 0.54), top: Math.round(H * (format === "feed-square" ? 0.1 : 0.14)), width: Math.round(W * 0.42), height: Math.round(H * 0.8) },
  };
}

/**
 * How the generation frame becomes the canvas: scaled to cover it, cropped evenly on the sides and
 * mostly from the bottom (foreground table), since tall products tend to reach the top.
 */
export function cropOf(format: SocialFormat) {
  const canvas = SOCIAL_CANVAS[format];
  const frame = GENERATION_FRAME[format];
  const scale = Math.max(canvas.width / frame.width, canvas.height / frame.height);
  const ox = Math.round((frame.width * scale - canvas.width) / 2);
  const oy = Math.round((frame.height * scale - canvas.height) * 0.3);
  return { scale, ox, oy, width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
}

/** Where a canvas box falls in the generation frame, in percent. */
export function boxInFrame(format: SocialFormat, b: Box): { x0: number; y0: number; x1: number; y1: number } {
  const frame = GENERATION_FRAME[format];
  const { scale, ox, oy } = cropOf(format);
  const pct = (v: number, total: number) => Math.round((v / total) * 100);
  return {
    x0: pct(b.left + ox, frame.width * scale),
    y0: pct(b.top + oy, frame.height * scale),
    x1: pct(b.left + b.width + ox, frame.width * scale),
    y1: pct(b.top + b.height + oy, frame.height * scale),
  };
}
