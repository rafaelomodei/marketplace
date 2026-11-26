"use client";

import { usePathname } from "next/navigation";
import { ButtonLink, SiteHeader } from "@/components/ui";

export function AppHeader() {
  const library = usePathname().startsWith("/biblioteca");
  return (
    <SiteHeader
      logoName="Studio"
      tabs={[
        { href: "/biblioteca", label: "Biblioteca", active: library },
        { href: "/", label: "Imagens", active: !library },
      ]}
      action={library ? null : <ButtonLink href="/#novo" variant="primary" size="sm" className="hidden sm:inline-flex">Novo produto</ButtonLink>}
    />
  );
}
