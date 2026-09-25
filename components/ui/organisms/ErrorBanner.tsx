"use client";

import { useEffect, useState } from "react";
import { Alert } from "../molecules/Alert";

/** Shows the last error sent with reportError() (lib/client/api.ts). */
export function ErrorBanner() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setMsg((e as CustomEvent<string>).detail);
    window.addEventListener("studio:error", on);
    return () => window.removeEventListener("studio:error", on);
  }, []);
  if (!msg) return null;
  return (
    <Alert tone="danger" onClose={() => setMsg(null)} className="animate-fade-up">
      {msg}
    </Alert>
  );
}
