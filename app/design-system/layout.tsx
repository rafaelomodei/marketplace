import type { Metadata } from "next";

/** Internal catalogue for developers: reachable by URL only, not linked in the menu and not indexed. */
export const metadata: Metadata = { title: "Design system · Marketplace Studio", robots: { index: false, follow: false } };

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
