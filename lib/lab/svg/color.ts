/** CSS colors → "#rrggbb" (lowercase), and how close two colors are. */

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", brown: "#a52a2a", gray: "#808080", grey: "#808080",
  silver: "#c0c0c0", gold: "#ffd700", navy: "#000080", teal: "#008080", maroon: "#800000", olive: "#808000",
  lime: "#00ff00", aqua: "#00ffff", cyan: "#00ffff", fuchsia: "#ff00ff", magenta: "#ff00ff", beige: "#f5f5dc",
  ivory: "#fffff0", khaki: "#f0e68c", lavender: "#e6e6fa", salmon: "#fa8072", coral: "#ff7f50", tomato: "#ff6347",
  crimson: "#dc143c", violet: "#ee82ee", indigo: "#4b0082", turquoise: "#40e0d0", tan: "#d2b48c", chocolate: "#d2691e",
  hotpink: "#ff69b4", deeppink: "#ff1493", skyblue: "#87ceeb", lightblue: "#add8e6", darkblue: "#00008b",
  lightgreen: "#90ee90", darkgreen: "#006400", forestgreen: "#228b22", seagreen: "#2e8b57", lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", whitesmoke: "#f5f5f5", mintcream: "#f5fffa",
  peachpuff: "#ffdab9", wheat: "#f5deb3", plum: "#dda0dd", orchid: "#da70d6", firebrick: "#b22222", sienna: "#a0522d",
  goldenrod: "#daa520", yellowgreen: "#9acd32", steelblue: "#4682b4", royalblue: "#4169e1", slategray: "#708090",
};

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** A color with its alpha (0–1), or null for "none"/"transparent" and anything we cannot read. */
export function parseColor(value: string | undefined): { hex: string; alpha: number } | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "none" || v === "transparent") return null;
  if (NAMED[v]) return { hex: NAMED[v], alpha: 1 };
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = [...h].map((c) => parseInt(c + c, 16));
      return { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`, alpha: h.length === 4 ? a / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) return { hex: `#${h.slice(0, 6)}`, alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
    return null;
  }
  m = v.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const nums = m[1].split(/[\s,/]+/).filter(Boolean);
    const ch = (s: string) => (s.endsWith("%") ? (parseFloat(s) * 255) / 100 : parseFloat(s));
    const [r, g, b] = nums.slice(0, 3).map(ch);
    if ([r, g, b].some(Number.isNaN)) return null;
    const a = nums[3] === undefined ? 1 : nums[3].endsWith("%") ? parseFloat(nums[3]) / 100 : parseFloat(nums[3]);
    return { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`, alpha: a };
  }
  return null;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Perceptual-ish distance ("redmean"): 0 = same color, ~765 = black vs white. */
export function colorDistance(a: string, b: string) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

/** Average of several colors (e.g. the stops of a gradient). */
export function mixColors(hexes: string[]) {
  const sum = [0, 0, 0];
  for (const h of hexes) rgb(h).forEach((c, i) => (sum[i] += c));
  return `#${sum.map((c) => hex2(c / hexes.length)).join("")}`;
}
