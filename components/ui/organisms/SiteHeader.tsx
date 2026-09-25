import Link from "next/link";
import { Logo } from "../atoms/Logo";

/** Sticky, translucent top bar: logo left, links center, one dark pill right. */
export function SiteHeader({ nav = [], action }: { nav?: { href: string; label: string }[]; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-canvas/60 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-8">
        <Link href="/" className="text-ink-strong">
          <Logo />
        </Link>
        <nav className="hidden flex-1 justify-center gap-7 text-sm text-ink-soft md:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="transition hover:text-ink-strong">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto md:ml-0">{action}</div>
      </div>
    </header>
  );
}
