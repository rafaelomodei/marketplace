"use client";

import { usePathname } from "next/navigation";
import { ButtonLink, SiteHeader } from "@/components/ui";

/** App header: the logo says which area you are in (Studio or Lab) and the switcher moves between them. */
export function AppHeader() {
  const inLab = usePathname().startsWith("/lab");
  return (
    <SiteHeader
      logoName={inLab ? "Lab" : "Studio"}
      tabs={[
        { href: "/", label: "Studio", active: !inLab },
        { href: "/lab", label: "Lab", active: inLab },
      ]}
      action={
        inLab ? null : (
          <ButtonLink href="/#novo" variant="primary" size="sm" className="hidden sm:inline-flex">
            Novo produto
          </ButtonLink>
        )
      }
    />
  );
}
