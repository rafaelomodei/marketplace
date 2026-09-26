/**
 * A small software renderer for Lab models: triangle soups (mm, Z up, like OpenSCAD) → RGBA pixels, with a depth
 * buffer, perspective and soft studio light. No DOM and no GPU, so the server (actions / MCP) can take pictures of a
 * piece without a browser. The piece is framed to fill the picture.
 */

export type RasterPart = { soup: Float32Array; color: string };

/**
 * Where the camera looks from, in degrees. `azimuth` 0 = in front of the piece (below the drawing, looking "up" the
 * page), positive = to its right. `elevation` 90 = straight above the table, 0 = level with it.
 */
export type RasterView = { azimuth: number; elevation: number };

export type RasterOptions = { width: number; height: number; background?: string; margin?: number; fov?: number };

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hexRgb = (hex: string): V3 => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as V3;
};

/** Lights in model space (Z up): a key light from the front-left, a fill from the right, light from above. */
const KEY = norm([-0.45, -0.7, 0.85]);
const FILL = norm([0.8, -0.2, 0.35]);

export function rasterize(parts: RasterPart[], view: RasterView, o: RasterOptions): Uint8ClampedArray {
  const { width: W, height: H } = o;
  const out = new Uint8ClampedArray(W * H * 4);
  const bg = hexRgb(o.background ?? "#ffffff");
  for (let i = 0; i < W * H; i++) out.set([bg[0] * 255, bg[1] * 255, bg[2] * 255, 255], i * 4);

  // Bounds → center and size of the piece.
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const { soup } of parts)
    for (let i = 0; i < soup.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], soup[i + k]);
        max[k] = Math.max(max[k], soup[i + k]);
      }
  if (!Number.isFinite(min[0])) return out;
  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 || 1;

  // Camera basis: looks at the center from the view's direction, Z up (the drawing's top stays up on a top view).
  const az = (view.azimuth * Math.PI) / 180;
  const el = (Math.min(89, Math.max(-89, view.elevation)) * Math.PI) / 180;
  const toEye = norm([Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)]);
  const fov = ((o.fov ?? 28) * Math.PI) / 180;
  const dist = radius / Math.sin(fov / 2);
  const eye: V3 = [center[0] + toEye[0] * dist, center[1] + toEye[1] * dist, center[2] + toEye[2] * dist];
  const forward = norm(sub(center, eye));
  const right = norm(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);

  // Project every vertex once: camera-space depth and perspective x/y; then frame the piece to fill the picture.
  const projected = parts.map(({ soup }) => {
    const p = new Float32Array(soup.length);
    for (let i = 0; i < soup.length; i += 3) {
      const d = sub([soup[i], soup[i + 1], soup[i + 2]], eye);
      const z = dot(d, forward);
      p[i] = dot(d, right) / z;
      p[i + 1] = dot(d, up) / z;
      p[i + 2] = z;
    }
    return p;
  });
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of projected)
    for (let i = 0; i < p.length; i += 3) {
      x0 = Math.min(x0, p[i]);
      x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]);
      y1 = Math.max(y1, p[i + 1]);
    }
  const margin = o.margin ?? 0.1;
  const scale = Math.min((W * (1 - 2 * margin)) / (x1 - x0 || 1), (H * (1 - 2 * margin)) / (y1 - y0 || 1));
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const sx = (x: number) => W / 2 + (x - cx) * scale;
  const sy = (y: number) => H / 2 - (y - cy) * scale;

  const depth = new Float32Array(W * H).fill(Infinity);
  parts.forEach(({ soup, color }, pi) => {
    const base = hexRgb(color).map(toLinear) as V3;
    const p = projected[pi];
    for (let t = 0; t < soup.length; t += 9) {
      const a: V3 = [soup[t], soup[t + 1], soup[t + 2]];
      let n = norm(cross(sub([soup[t + 3], soup[t + 4], soup[t + 5]], a), sub([soup[t + 6], soup[t + 7], soup[t + 8]], a)));
      if (dot(n, sub(eye, a)) < 0) n = [-n[0], -n[1], -n[2]]; // light the side facing the camera
      const light = 0.34 + 0.62 * Math.max(0, dot(n, KEY)) + 0.22 * Math.max(0, dot(n, FILL)) + 0.12 * Math.max(0, n[2]);
      const rgb = base.map((c) => Math.round(Math.min(1, toSrgb(Math.min(1, c * light))) * 255));

      const X = [sx(p[t]), sx(p[t + 3]), sx(p[t + 6])];
      const Y = [sy(p[t + 1]), sy(p[t + 4]), sy(p[t + 7])];
      const Z = [p[t + 2], p[t + 5], p[t + 8]];
      const area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(X[0], X[1], X[2])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(X[0], X[1], X[2])));
      const minY = Math.max(0, Math.floor(Math.min(Y[0], Y[1], Y[2])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(Y[0], Y[1], Y[2])));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((X[1] - px) * (Y[2] - py) - (X[2] - px) * (Y[1] - py)) / area;
          const w1 = ((X[2] - px) * (Y[0] - py) - (X[0] - px) * (Y[2] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * Z[0] + w1 * Z[1] + w2 * Z[2];
          const i = y * W + x;
          if (z >= depth[i]) continue;
          depth[i] = z;
          out[i * 4] = rgb[0];
          out[i * 4 + 1] = rgb[1];
          out[i * 4 + 2] = rgb[2];
        }
    }
  });
  return out;
}
