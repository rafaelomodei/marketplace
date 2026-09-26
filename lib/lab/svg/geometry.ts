/**
 * SVG geometry → polygons: transforms, path data (lines, Béziers, arcs) and basic shapes, all flattened
 * into rings of points. `tol` is the maximum distance (in the shape's own units) between a curve and its polygon.
 */
export type Pt = [number, number];
export type Ring = Pt[];
/** Affine matrix [a, b, c, d, e, f], like SVG's matrix(): x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const apply = (m: Matrix, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** How much the matrix scales lengths (used to keep curve precision in the final units). */
export const matrixScale = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

const numbers = (s: string) => (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

export function parseTransform(value: string | undefined): Matrix {
  let m = IDENTITY;
  if (!value) return m;
  for (const [, fn, args] of value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = numbers(args);
    let t: Matrix = IDENTITY;
    if (fn === "matrix" && a.length === 6) t = a as Matrix;
    else if (fn === "translate") t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === "scale") t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === "rotate") {
      const r = ((a[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      t = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === "skewX") t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = multiply(m, t);
  }
  return m;
}

/** Number of segments for a curve whose control polygon is `len` long. */
const steps = (len: number, tol: number) => Math.min(64, Math.max(2, Math.ceil(Math.sqrt(len / tol) * 0.9)));
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function cubic(out: Ring, p0: Pt, p1: Pt, p2: Pt, p3: Pt, tol: number) {
  const n = steps(dist(p0, p1) + dist(p1, p2) + dist(p2, p3), tol);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function quad(out: Ring, p0: Pt, p1: Pt, p2: Pt, tol: number) {
  const n = steps(dist(p0, p1) + dist(p1, p2), tol);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}

/** Elliptical arc (SVG endpoint parameterization, spec F.6.5). */
function arc(out: Ring, p0: Pt, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, p1: Pt, tol: number) {
  if (dist(p0, p1) < 1e-9) return;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return void out.push(p1);
  const phi = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t0 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.min(96, Math.max(2, Math.ceil(Math.abs(dt) / (2 * Math.acos(Math.max(-1, 1 - tol / Math.max(rx, ry)))))));
  for (let i = 1; i <= n; i++) {
    const t = t0 + (dt * i) / n;
    const [ex, ey] = [rx * Math.cos(t), ry * Math.sin(t)];
    out.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
}

/** Path data → closed rings (every subpath is closed, as a fill would). */
export function pathRings(d: string, tol: number): Ring[] {
  const tokens = d.match(/[a-df-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const rings: Ring[] = [];
  let ring: Ring = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let ctrl: Pt | null = null; // last control point, reflected by S (after C/S) and T (after Q/T)
  let ctrlKind = "";
  let cmd = "";
  let i = 0;
  const flush = () => {
    if (ring.length > 2) rings.push(ring);
    ring = [];
  };
  const num = () => Number(tokens[i++]);
  // Arc flags may be packed without separators ("a10 10 0 01 5 5").
  const flag = () => {
    const t = tokens[i];
    if (t.length > 1 && (t[0] === "0" || t[0] === "1") && !t.includes(".")) {
      tokens[i] = t.slice(1);
      return t[0] === "1";
    }
    i++;
    return t === "1";
  };
  while (i < tokens.length) {
    const loopStart = i;
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    const C = cmd.toUpperCase();
    const prevCtrl = (C === "S" && ctrlKind === "C") || (C === "T" && ctrlKind === "Q") ? ctrl : null;
    ctrl = null;
    ctrlKind = C === "C" || C === "S" ? "C" : C === "Q" || C === "T" ? "Q" : "";
    switch (C) {
      case "M":
        flush();
        cur = at(num(), num());
        start = cur;
        ring.push(cur);
        cmd = rel ? "l" : "L"; // following pairs are line-tos
        break;
      case "L":
        cur = at(num(), num());
        ring.push(cur);
        break;
      case "H":
        cur = [rel ? cur[0] + num() : num(), cur[1]];
        ring.push(cur);
        break;
      case "V":
        cur = [cur[0], rel ? cur[1] + num() : num()];
        ring.push(cur);
        break;
      case "C": {
        const [p1, p2, p3] = [at(num(), num()), at(num(), num()), at(num(), num())];
        cubic(ring, cur, p1, p2, p3, tol);
        [cur, ctrl] = [p3, p2];
        break;
      }
      case "S": {
        const p1: Pt = prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur;
        const [p2, p3] = [at(num(), num()), at(num(), num())];
        cubic(ring, cur, p1, p2, p3, tol);
        [cur, ctrl] = [p3, p2];
        break;
      }
      case "Q": {
        const [p1, p2] = [at(num(), num()), at(num(), num())];
        quad(ring, cur, p1, p2, tol);
        [cur, ctrl] = [p2, p1];
        break;
      }
      case "T": {
        const p1: Pt = prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur;
        const p2 = at(num(), num());
        quad(ring, cur, p1, p2, tol);
        [cur, ctrl] = [p2, p1];
        break;
      }
      case "A": {
        const [rx, ry, rot] = [num(), num(), num()];
        const [large, sweep] = [flag(), flag()];
        const p = at(num(), num());
        arc(ring, cur, rx, ry, rot, large, sweep, p, tol);
        cur = p;
        break;
      }
      case "Z":
        flush();
        cur = start;
        ring.push(cur); // a new subpath without M starts where the last one began
        break;
      default:
        i++; // unknown command: skip its argument
    }
    if (i === loopStart) i++; // stray number after Z: skip it
    if (Number.isNaN(cur[0]) || Number.isNaN(cur[1])) break; // ran out of numbers
  }
  flush();
  return rings;
}

export function ellipseRing(cx: number, cy: number, rx: number, ry: number, tol: number): Ring {
  const r = Math.max(rx, ry);
  const n = Math.min(128, Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / r)))));
  return Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)] as Pt);
}

export function rectRing(x: number, y: number, w: number, h: number, rx: number, ry: number, tol: number): Ring {
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (!rx || !ry) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const d = `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}` +
    `H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
  return pathRings(d, tol)[0];
}

export const pointsRing = (value: string): Ring => {
  const n = numbers(value);
  const ring: Ring = [];
  for (let i = 0; i + 1 < n.length; i += 2) ring.push([n[i], n[i + 1]]);
  return ring;
};

export function signedArea(ring: Ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}

/** Even-odd point-in-polygon over several rings (holes are rings inside rings). */
export function inside(rings: Ring[], [x, y]: Pt) {
  let hit = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) hit = !hit;
  return hit;
}

/** Drops points closer than `tol` to the previous one (curves exported with too many nodes). */
export function simplify(ring: Ring, tol: number): Ring {
  const out: Ring = [];
  for (const p of ring) if (!out.length || dist(out[out.length - 1], p) >= tol) out.push(p);
  while (out.length > 3 && dist(out[0], out[out.length - 1]) < tol) out.pop();
  return out;
}
