"use client";

import { useEffect, useRef, useState } from "react";
import type { RenderResult } from "./engine";
import { labJob } from "./job";
import { parseStl } from "./mesh";
import type { ParamValues } from "./params";
import type { LabTool } from "./types";

/** One OpenSCAD worker for the whole page, created on first use. */
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (msg: { ok: boolean; result?: RenderResult; error?: string }) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./openscad.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

/** `key`: the values it was rendered from (JSON), to know whether it is up to date. */
export type RenderedModel = { stl: Record<string, Uint8Array>; soups: Record<string, Float32Array>; ms: number; key: string };

/**
 * Re-renders the tool whenever the values change (debounced). Keeps showing the last good model
 * while a new one renders; stale results are dropped.
 */
export function useScadRender(tool: LabTool, values: ParamValues, enabled: boolean, delay = 350) {
  const [model, setModel] = useState<RenderedModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const key = JSON.stringify(values);

  useEffect(() => {
    if (!enabled || !tool.source || !tool.parts || !tool.params) return;
    const job = labJob(tool, values, { preview: true });
    const timer = setTimeout(() => {
      const id = ++nextId;
      latest.current = id;
      setBusy(true);
      pending.set(id, (msg) => {
        if (latest.current !== id) return;
        setBusy(false);
        if (!msg.ok || !msg.result) return setError(msg.error ?? "Não foi possível gerar o modelo.");
        const soups = Object.fromEntries(Object.entries(msg.result.parts).map(([k, v]) => [k, parseStl(v)]));
        setModel({ stl: msg.result.parts, soups, ms: msg.result.ms, key });
        setError(null);
      });
      getWorker().postMessage({ id, source: job.source, values: job.scadValues, fontFiles: job.fontFiles, parts: job.parts });
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, tool.id]);

  return { model, busy, error };
}
