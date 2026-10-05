/** Pure text helpers (safe to import in the browser). */

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "hoje, 14:32", "ontem, 09:10" or "12 de set." — when something was last changed. */
export function whenPtBr(iso: string, today = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(today) - day(d)) / 86_400_000);
  if (diff === 0) return `hoje, ${time}`;
  if (diff === 1) return `ontem, ${time}`;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }) });
}
