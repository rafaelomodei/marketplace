import { NextResponse } from "next/server";
import { ensureWorker } from "./jobs";
import { HttpError } from "./products";

/** Wraps a route handler: starts the job worker and turns thrown errors into JSON responses. */
export async function handle(fn: () => unknown | Promise<unknown>) {
  try {
    ensureWorker();
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    if (status === 500) console.error("[studio]", err);
    return NextResponse.json({ error: message }, { status });
  }
}
