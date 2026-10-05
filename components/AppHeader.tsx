"use client";

import { ButtonLink, SiteHeader } from "@/components/ui";

export function AppHeader() {
  return (
    <SiteHeader
      logoName="Studio"
      action={<ButtonLink href="/#novo" variant="primary" size="sm" className="hidden sm:inline-flex">Novo produto</ButtonLink>}
    />
  );
}
