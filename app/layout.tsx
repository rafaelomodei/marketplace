import type { Metadata } from "next";
// Fonts ship with the app (no network needed to build or run).
import "@fontsource-variable/inter-tight";
import "@fontsource/fragment-mono";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketplace Studio",
  description: "Fotos de anúncio para Shopee e Mercado Livre, criadas com IA a partir das fotos do seu produto.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">
        <AppHeader />
        {/* The header floats over the painted heroes. */}
        <main className="-mt-16">{children}</main>
      </body>
    </html>
  );
}
