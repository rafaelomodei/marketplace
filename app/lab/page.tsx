// Direct import: the barrel also exports the 3D workbench (three.js), not needed here.
import { ToolCard } from "@/components/lab/ToolCard";
import { Badge, Container, Heading, Lead, PaintedBackdrop, SectionHeader } from "@/components/ui";
import { LAB_TOOLS } from "@/lib/lab/tools";

export const metadata = { title: "Lab · Marketplace Studio" };

export default function LabPage() {
  return (
    <>
      <section className="relative flex min-h-[62svh] items-end pb-14">
        <PaintedBackdrop align="middle" />
        <Container narrow className="relative animate-fade-up space-y-6 text-center">
          <Badge dot tone="accent">
            Lab
          </Badge>
          <Heading as="h1" size="display">
            Crie peças
            <br />
            personalizadas
          </Heading>
          <Lead className="mx-auto max-w-xl">
            Ferramentas para montar produtos sob medida para o seu cliente — digite, escolha as cores e baixe o arquivo pronto para imprimir.
          </Lead>
        </Container>
      </section>

      <Container className="space-y-10 py-16">
        <SectionHeader eyebrow="Ferramentas" title="O que você quer criar?" />
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {LAB_TOOLS.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </Container>
    </>
  );
}
