/** Browser helpers to talk to the studio API. */
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** URL of a product image; `w` returns a cached JPEG thumbnail of that width. */
export const fileUrl = (slug: string, rel: string, w?: number) =>
  `/files/${encodeURIComponent(slug)}/${rel.split("/").map(encodeURIComponent).join("/")}${w ? `?w=${w}` : ""}`;

/** Reports an error to <ErrorBanner /> (anywhere on the page). */
export function reportError(e: unknown) {
  console.error(e);
  // Bugs in our own code (TypeError and friends) mean nothing to the seller; the console keeps the detail.
  const internal = e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError;
  const offline = e instanceof TypeError && /fetch|network/i.test(e.message);
  const message = offline ? "Não foi possível falar com o Studio. Verifique se ele está rodando e tente de novo." : internal ? "Algo deu errado nesta tela. Tente de novo; se continuar, recarregue a página." : (e as Error).message;
  window.dispatchEvent(new CustomEvent("studio:error", { detail: message }));
}

/** Runs a studio action by name (same as an MCP tool call). */
export const action = <T = any>(name: string, input: unknown = {}) => api<T>(`/api/actions/${name}`, { method: "POST", json: input });

/** Picture of a library file: the slicer's plate picture, or a render of the model. */
export const libraryPictureUrl = (slug: string, file: string, plate = 1, w = 480, v = "") =>
  `/api/library/${encodeURIComponent(slug)}/picture?file=${encodeURIComponent(file)}&plate=${plate}&w=${w}${v ? `&v=${encodeURIComponent(v)}` : ""}`;

/** Any picture of a library project — a plate of a file or a studio image (cover, gallery) — `w` px wide. */
export const projectPictureUrl = (slug: string, pic: { file: string; plate: number } | { image: string }, w = 480, v = "") =>
  "file" in pic
    ? libraryPictureUrl(slug, pic.file, pic.plate, w, v)
    : `/api/library/${encodeURIComponent(slug)}/picture?image=${encodeURIComponent(pic.image)}&w=${w}${v ? `&v=${encodeURIComponent(v)}` : ""}`;
