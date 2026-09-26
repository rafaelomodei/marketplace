"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { LabCreation, LabCreationSummary } from "@/lib/lab/creations";
import type { ParamValues } from "@/lib/lab/params";
import type { PartColor } from "./PartColorField";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Data = { values: ParamValues; colors: Record<string, PartColor> };

/** Browsers drop `keepalive` requests bigger than 64 KB (a drawing can be bigger): those go as a normal request. */
const KEEPALIVE_MAX = 60_000;

/** What gets compared to know whether there is something to save. */
const dataKey = (d: Data, name: string | null) => JSON.stringify({ ...d, name });

/**
 * Saves the piece being edited to the tool's history on its own, a moment after each change: the first save creates it
 * (and the address becomes /lab/<tool>/<id>, so a reload reopens it), the next ones update it. Nothing is saved until
 * something changes, so just opening the editor does not fill the history. When the 3D shows exactly these values
 * (`ready`), `snapshot` gives the thumbnail; otherwise the previous picture is kept. Pending changes go out when leaving.
 *
 * The name follows the values (`autoName`) until someone types one (`rename`). `detach` starts a new piece: the next
 * save creates another creation instead of changing this one.
 */
export function useCreationSave(o: {
  toolId: string;
  creation?: LabCreation | null;
  data: Data;
  autoName: string;
  ready: boolean;
  snapshot: () => string | null;
  delay?: number;
}) {
  const [customName, setCustomName] = useState<string | null>(o.creation?.customName ? o.creation.name : null);
  const key = dataKey(o.data, customName);
  const id = useRef(o.creation?.id ?? null);
  const savedKey = useRef(key); // what the server has (at first: what was opened)
  const thumbKey = useRef(o.creation?.hasThumbnail ? key : ""); // what the saved picture shows
  const latest = useRef({ ...o, key, customName });
  latest.current = { ...o, key, customName };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<SaveStatus>(o.creation ? "saved" : "idle");
  const [creationId, setCreationId] = useState(id.current);

  const send = useCallback(async (withThumbnail: boolean, keepalive: boolean) => {
    const { toolId, data, snapshot, key, customName } = latest.current;
    const thumbnail = withThumbnail && thumbKey.current !== key ? snapshot() : null;
    if (key === savedKey.current && !thumbnail) return;
    const body = JSON.stringify({ tool: toolId, ...data, name: customName, ...(thumbnail ? { thumbnail } : {}) });
    savedKey.current = key;
    setStatus("saving");
    try {
      const r = await api<LabCreationSummary>(id.current ? `/api/lab/creations/${id.current}` : "/api/lab/creations", {
        method: id.current ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: keepalive && body.length < KEEPALIVE_MAX,
      });
      if (thumbnail) thumbKey.current = key;
      if (!id.current) {
        id.current = r.id;
        setCreationId(r.id);
        window.history.replaceState(window.history.state, "", `/lab/${toolId}/${r.id}`);
      }
      setStatus(latest.current.key === savedKey.current ? "saved" : "saving");
    } catch (e) {
      console.error(e);
      savedKey.current = ""; // try again with the next change
      setStatus("error");
    }
  }, []);

  /** Sends what is pending now, after the saves already on their way (so the first one creates, the others update). */
  const flush = useCallback(
    (keepalive = false) => (queue.current = queue.current.then(() => send(latest.current.ready && !keepalive, keepalive))),
    [send],
  );

  /**
   * From now on, a new piece (call after `flush`, with the data it starts from). `blank`: it is just the starting point
   * (the sample), saved only once something changes; otherwise (e.g. a drawing was sent) it is saved right away.
   */
  const detach = (data: Data, blank: boolean) => {
    id.current = null;
    setCreationId(null);
    setCustomName(null);
    setStatus("idle");
    savedKey.current = blank ? dataKey(data, null) : "";
    thumbKey.current = "";
    window.history.replaceState(window.history.state, "", `/lab/${latest.current.toolId}/novo`);
  };

  /** A name typed by someone; empty (or the automatic one) goes back to following the values. */
  const rename = (name: string) => {
    const n = name.trim();
    setCustomName(n && n !== latest.current.autoName ? n : null);
  };

  useEffect(() => {
    const changed = key !== savedKey.current;
    const staleThumb = o.ready && !!id.current && thumbKey.current !== key;
    if (!changed && !staleThumb) return;
    const timer = setTimeout(() => flush(), o.delay ?? 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, o.ready]);

  // Leaving the editor (another page of the app, closing the tab): send what is pending, without a new picture.
  useEffect(() => {
    const leave = () => void flush(true);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [flush]);

  // Once something was saved, the tool has a history to go back to.
  const [savedAny, setSavedAny] = useState(!!o.creation);
  useEffect(() => {
    if (creationId) setSavedAny(true);
  }, [creationId]);

  return { status, creationId, savedAny, name: customName ?? o.autoName, customName: customName !== null, rename, flush, detach };
}
