"use client";

import { Info } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { Icon } from "../atoms/Icon";

/** Contextual help. Use a short description for simple fields or an optional image for richer examples. */
export function InfoTip({ title, description, subtitle, image, imageAlt = "" }: { title: string; description: string; subtitle?: string; image?: string; imageAlt?: string }) {
  return <Dropdown align="start" className="w-80 p-4" trigger={(open, toggle) => <button type="button" aria-label={`Ajuda: ${title}`} aria-expanded={open} onClick={toggle} className="inline-grid size-5 place-items-center rounded-full text-ink-faint hover:bg-surface hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-ink-strong"><Icon icon={Info} className="size-4"/></button>}>
    <article className="space-y-2 p-2">
      {image && <div className="overflow-hidden rounded-xl bg-surface">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={image} alt={imageAlt} className="max-h-40 w-full object-cover"/></div>}
      <h3 className="text-sm font-medium text-ink-strong">{title}</h3>
      {subtitle && <p className="text-xs font-medium text-ink-soft">{subtitle}</p>}
      <p className="text-xs leading-relaxed text-ink-muted">{description}</p>
    </article>
  </Dropdown>;
}
