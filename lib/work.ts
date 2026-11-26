/**
 * Long CPU work (reading big meshes, drawing pictures) is written as generators that `yield` now and then, so the
 * same code runs to the end at once (`runSync`) or pausing between steps so the server keeps answering (`runAsync`).
 */
export type Work<T> = Generator<void, T, void>;

export function runSync<T>(work: Work<T>): T {
  for (;;) {
    const r = work.next();
    if (r.done) return r.value;
  }
}

export async function runAsync<T>(work: Work<T>): Promise<T> {
  for (;;) {
    const r = work.next();
    if (r.done) return r.value;
    await new Promise((resolve) => setImmediate(resolve));
  }
}
