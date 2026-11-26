"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `load` every `ms` while the page is visible, waiting for each call to finish before counting the next
 * (a slow server never gets a pile of requests) and calling it again when the tab comes back into view.
 */
export function usePolling(load: () => unknown, ms: number) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let busy = false;
    const tick = async () => {
      timer = undefined;
      if (document.visibilityState === "visible") {
        busy = true;
        try { await latest.current(); } catch { /* the page shows its own errors */ }
        busy = false;
      }
      if (!stopped) timer = setTimeout(tick, ms);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped || busy) return;
      clearTimeout(timer);
      void tick();
    };
    timer = setTimeout(tick, ms);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
}
