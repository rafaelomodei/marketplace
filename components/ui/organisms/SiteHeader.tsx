import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "../atoms/Logo";

export type HeaderTab = { href: string; label: string; active?: boolean };

/** Sticky, translucent top bar: logo left, area switcher center, one action right. */
export function SiteHeader({ logoName, tabs = [], action }: { logoName?: string; tabs?: HeaderTab[]; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-canvas/60 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-8">
        <Link href="/" className="text-ink-strong">
          <Logo name={logoName} />
        </Link>
        {tabs.length > 0 && (
          <nav aria-label="Áreas" className="mx-auto flex rounded-full bg-canvas/70 p-1 ring-1 ring-line ring-inset backdrop-blur">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13px] font-medium transition",
                  t.active ? "bg-ink-strong text-white" : "text-ink-soft hover:text-ink-strong",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
        <div className={cn("flex justify-end sm:min-w-32", !tabs.length && "ml-auto")}>{action}</div>
      </div>
    </header>
  );
}
