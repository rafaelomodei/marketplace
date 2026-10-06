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
