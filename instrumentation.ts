export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureWorker } = await import("./lib/jobs");
  const { syncAll } = await import("./lib/products");
  syncAll();
  ensureWorker();
}
