import { strToU8, zipSync } from "fflate";

/** Triangle soup (x,y,z per vertex, 3 vertices per triangle) from a binary or ASCII STL. */
export function parseStl(data: Uint8Array): Float32Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = data.byteLength >= 84 ? view.getUint32(80, true) : 0;
  if (data.byteLength === 84 + count * 50) {
    const out = new Float32Array(count * 9);
    for (let t = 0; t < count; t++) {
      const o = 84 + t * 50 + 12; // skip the normal
      for (let i = 0; i < 9; i++) out[t * 9 + i] = view.getFloat32(o + i * 4, true);
    }
    return out;
  }
  const text = new TextDecoder().decode(data);
  const nums = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [+m[1], +m[2], +m[3]]);
  return new Float32Array(nums);
}

export type Bounds = { min: [number, number, number]; max: [number, number, number] };

export function bounds(soups: Float32Array[]): Bounds | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const s of soups)
    for (let i = 0; i < s.length; i++) {
      const a = i % 3;
      if (s[i] < min[a]) min[a] = s[i];
      if (s[i] > max[a]) max[a] = s[i];
    }
  return min[0] === Infinity ? null : { min, max };
}

/** Size in mm (width × depth × height). */
export const dimensions = (b: Bounds) => b.max.map((v, i) => v - b.min[i]) as [number, number, number];

/** Binary STL from triangle soups (several soups become one file, e.g. a base with its fused letters). */
export function buildStl(soups: Float32Array[]): Uint8Array {
  const count = soups.reduce((n, s) => n + s.length / 9, 0);
  const out = new Uint8Array(84 + count * 50);
  const view = new DataView(out.buffer);
  view.setUint32(80, count, true);
  let o = 84;
  for (const s of soups)
    for (let t = 0; t < s.length; t += 9) {
      // Normal from the winding (slicers recompute it anyway).
      const ux = s[t + 3] - s[t], uy = s[t + 4] - s[t + 1], uz = s[t + 5] - s[t + 2];
      const vx = s[t + 6] - s[t], vy = s[t + 7] - s[t + 1], vz = s[t + 8] - s[t + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      view.setFloat32(o, nx / len, true);
      view.setFloat32(o + 4, ny / len, true);
      view.setFloat32(o + 8, nz / len, true);
      for (let i = 0; i < 9; i++) view.setFloat32(o + 12 + i * 4, s[t + i], true);
      o += 50;
    }
  return out;
}

/** Shares identical vertices so the 3MF mesh is compact and watertight for slicers. */
function indexed(soup: Float32Array) {
  const map = new Map<string, number>();
  const vertices: number[] = [];
  const triangles: number[] = [];
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${soup[i].toFixed(4)},${soup[i + 1].toFixed(4)},${soup[i + 2].toFixed(4)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = vertices.length / 3;
      map.set(key, idx);
      vertices.push(soup[i], soup[i + 1], soup[i + 2]);
    }
    triangles.push(idx);
  }
  return { vertices, triangles };
}

/**
 * One 3MF with every part as a separate piece of the same object, each with its color —
 * Bambu Studio / OrcaSlicer / PrusaSlicer open it ready to assign a filament per part.
 */
export function build3mf(parts: { name: string; color: string; soup: Float32Array }[]): Uint8Array {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const materials = parts.map((p) => `<base name="${esc(p.name)}" displaycolor="${p.color.toUpperCase()}FF"/>`).join("");
  const objects = parts
    .map((p, i) => {
      const { vertices, triangles } = indexed(p.soup);
      const v: string[] = [];
      for (let j = 0; j < vertices.length; j += 3) v.push(`<vertex x="${vertices[j]}" y="${vertices[j + 1]}" z="${vertices[j + 2]}"/>`);
      const t: string[] = [];
      for (let j = 0; j < triangles.length; j += 3) t.push(`<triangle v1="${triangles[j]}" v2="${triangles[j + 1]}" v3="${triangles[j + 2]}"/>`);
      return `<object id="${i + 2}" name="${esc(p.name)}" type="model" pid="1" pindex="${i}"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object>`;
    })
    .join("");
  const assemblyId = parts.length + 2;
  const components = parts.map((_, i) => `<component objectid="${i + 2}"/>`).join("");
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<resources><basematerials id="1">${materials}</basematerials>${objects}` +
    `<object id="${assemblyId}" name="Modelo" type="model"><components>${components}</components></object></resources>` +
    `<build><item objectid="${assemblyId}"/></build></model>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    "3D/3dmodel.model": strToU8(model),
  });
}
