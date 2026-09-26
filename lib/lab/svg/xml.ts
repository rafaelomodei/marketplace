/**
 * Minimal XML reader for SVG files: elements, attributes and text (for <style>). No DOM needed, so the same
 * code runs in the browser, in the Web Worker and in Node (actions / future MCP tools).
 */
export type XmlNode = { tag: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m),
  );

const TAG = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** Parses the document and returns its root element (the first top-level element). */
export function parseXml(source: string): XmlNode {
  // CDATA keeps its text (CSS inside <style>); comments, doctype and processing instructions are dropped.
  const src = source
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => t.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
  const root: XmlNode = { tag: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let last = 0;
  for (const m of src.matchAll(TAG)) {
    stack[stack.length - 1].text += decodeEntities(src.slice(last, m.index));
    last = m.index + m[0].length;
    const [, closing, rawTag, rawAttrs, selfClosing] = m;
    const tag = rawTag.replace(/^svg:/, "");
    if (closing) {
      // Tolerant: close up to the matching element (ignores stray closing tags).
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of rawAttrs.matchAll(ATTR)) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    const node: XmlNode = { tag, attrs, children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  const top = root.children[0];
  if (!top) throw new Error("O arquivo não parece ser um SVG.");
  return top;
}
