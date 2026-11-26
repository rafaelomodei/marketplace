import { runAsync, runSync, type Work } from "./work";

/**
 * A small software renderer: triangle soups (mm, Z up, like STL/3MF) → RGBA pixels, with a depth
 * buffer, perspective and soft studio light. No DOM and no GPU, so the server (actions / MCP) can take pictures of a
 * piece without a browser. The piece is framed to fill the picture.
 */

/**
 * A mesh: `soup` holds x,y,z per vertex. Without `index` every 3 vertices are a triangle (a triangle soup); with it,
 * each 3 indices are a triangle (shared vertices: a third of the memory of a soup for big models).
 */
export type RasterMesh = { soup: Float32Array; index?: Uint32Array };
export type RasterPart = RasterMesh & { color: string };

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
  return runSync(rasterizeWork(parts, view, o));
}

/** Same as `rasterize`, pausing every few hundred thousand triangles so the server keeps answering. */
export function rasterizeAsync(parts: RasterPart[], view: RasterView, o: RasterOptions): Promise<Uint8ClampedArray> {
  return runAsync(rasterizeWork(parts, view, o));
}

const STEP = 250_000;

function* rasterizeWork(parts: RasterPart[], view: RasterView, o: RasterOptions): Work<Uint8ClampedArray> {
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
        const v = soup[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
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
  const [ex, ey, ez] = eye;

  // Project every vertex once: camera-space depth and perspective x/y; then frame the piece to fill the picture.
  const projected: Float32Array[] = [];
  for (const { soup } of parts) {
    const p = new Float32Array(soup.length);
    for (let i = 0; i < soup.length; i += 3) {
      const dx = soup[i] - ex;
      const dy = soup[i + 1] - ey;
      const dz = soup[i + 2] - ez;
      const z = dx * forward[0] + dy * forward[1] + dz * forward[2];
      p[i] = (dx * right[0] + dy * right[1] + dz * right[2]) / z;
      p[i + 1] = (dx * up[0] + dy * up[1] + dz * up[2]) / z;
      p[i + 2] = z;
    }
    projected.push(p);
    yield;
  }
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of projected)
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < x0) x0 = p[i];
      if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1];
      if (p[i + 1] > y1) y1 = p[i + 1];
    }
  const margin = o.margin ?? 0.1;
  const scale = Math.min((W * (1 - 2 * margin)) / (x1 - x0 || 1), (H * (1 - 2 * margin)) / (y1 - y0 || 1));
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];

  const depth = new Float32Array(W * H).fill(Infinity);
  const frame: Frame = { W, H, cx, cy, scale, ex, ey, ez, out, depth };
  for (let pi = 0; pi < parts.length; pi++) {
    const { soup, index } = parts[pi];
    const base = hexRgb(parts[pi].color).map(toLinear) as V3;
    const count = index ? Math.floor(index.length / 3) : Math.floor(soup.length / 9);
    for (let t = 0; t < count; t += STEP) {
      drawTriangles(frame, soup, index, projected[pi], base, t, Math.min(count, t + STEP));
      yield;
    }
  }
  return out;
}

type Frame = { W: number; H: number; cx: number; cy: number; scale: number; ex: number; ey: number; ez: number; out: Uint8ClampedArray; depth: Float32Array };

/** Draws triangles `from`…`to` of a mesh (a plain function, out of the generator, so V8 optimizes the hot loop). */
function drawTriangles(f: Frame, soup: Float32Array, index: Uint32Array | undefined, p: Float32Array, base: V3, from: number, to: number) {
  const { W, H, cx, cy, scale, ex, ey, ez, out, depth } = f;
  const [br, bgc, bb] = base;
  const shade = (c: number, light: number) => Math.round(Math.min(1, toSrgb(Math.min(1, c * light))) * 255);
  const len = soup.length;
  for (let t = from; t < to; t++) {
    // Offsets of the triangle's three vertices in `soup` / `p`.
    const ia = index ? index[t * 3] * 3 : t * 9;
    const ib = index ? index[t * 3 + 1] * 3 : t * 9 + 3;
    const ic = index ? index[t * 3 + 2] * 3 : t * 9 + 6;
    if (ia + 2 >= len || ib + 2 >= len || ic + 2 >= len) continue;

    // Screen position first: most triangles of a big model are smaller than a pixel and miss every pixel center.
    const X0 = W / 2 + (p[ia] - cx) * scale, X1 = W / 2 + (p[ib] - cx) * scale, X2 = W / 2 + (p[ic] - cx) * scale;
    const Y0 = H / 2 - (p[ia + 1] - cy) * scale, Y1 = H / 2 - (p[ib + 1] - cy) * scale, Y2 = H / 2 - (p[ic + 1] - cy) * scale;
    const area = (X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(X0, X1, X2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(X0, X1, X2)));
    const minY = Math.max(0, Math.floor(Math.min(Y0, Y1, Y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(Y0, Y1, Y2)));
    if (minX > maxX || minY > maxY) continue;
    const Z0 = p[ia + 2], Z1 = p[ib + 2], Z2 = p[ic + 2];

    let r = -1, g = 0, b = 0;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((X1 - px) * (Y2 - py) - (X2 - px) * (Y1 - py)) / area;
        const w1 = ((X2 - px) * (Y0 - py) - (X0 - px) * (Y2 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * Z0 + w1 * Z1 + w2 * Z2;
        const i = y * W + x;
        if (z >= depth[i]) continue;
        depth[i] = z;
        if (r < 0) {
          // Light the side facing the camera (only for triangles that actually show).
          const ax = soup[ia], ay = soup[ia + 1], az = soup[ia + 2];
          const ux = soup[ib] - ax, uy = soup[ib + 1] - ay, uz = soup[ib + 2] - az;
          const vx = soup[ic] - ax, vy = soup[ic + 1] - ay, vz = soup[ic + 2] - az;
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz) || 1;
          const s = nx * (ex - ax) + ny * (ey - ay) + nz * (ez - az) < 0 ? -1 / l : 1 / l;
          nx *= s;
          ny *= s;
          nz *= s;
          const light = 0.34 + 0.62 * Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]) + 0.22 * Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]) + 0.12 * Math.max(0, nz);
          r = shade(br, light);
          g = shade(bgc, light);
          b = shade(bb, light);
        }
        out[i * 4] = r;
        out[i * 4 + 1] = g;
        out[i * 4 + 2] = b;
      }
  }
}
