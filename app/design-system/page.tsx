"use client";

import { ArrowRight, Camera, Download, MousePointerClick, PackageOpen, Palette, SunMedium, Wand2 } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  ChoiceGroup,
  Code,
  Container,
  Disclosure,
  Dropzone,
  EmptyState,
  FeatureGrid,
  Field,
  Heading,
  Icon,
  IconTile,
  Input,
  Lead,
  Muted,
  OptionCard,
  PaintedBackdrop,
  Progress,
  SectionHeader,
  Spinner,
  Stepper,
  Swatch,
  Textarea,
} from "@/components/ui";

const COLORS = [
  ["Ink", ["ink-strong", "ink", "ink-soft", "ink-muted", "ink-faint"]],
  ["Superfícies", ["canvas", "surface", "panel", "line", "line-strong"]],
  ["Pastéis pintados", ["peach", "rose", "lilac", "mint", "sun", "sky"]],
  ["Acento e status", ["accent", "lake", "success", "warning", "danger"]],
] as const;

export default function DesignSystem() {
  const [mode, setMode] = useState("white");
  const [single, setSingle] = useState("shopee");
  const [multi, setMulti] = useState(["1x1", "3x4"]);
  const [step, setStep] = useState("create");

  return (
    <>
      <section className="relative pt-32 pb-16">
        <PaintedBackdrop align="middle" className="h-[28rem]" />
        <Container className="relative space-y-5">
          <Badge dot tone="accent">
            Design system
          </Badge>
          <Heading as="h1" size="display">
            Ateliê
          </Heading>
          <Lead className="max-w-xl">
            Neutros quentes, títulos leves e apertados, botões em pílula, linhas finas e paisagens pintadas. Tudo aqui vem de{" "}
            <Code className="text-base">components/ui</Code> e dos tokens em <Code className="text-base">app/globals.css</Code>.
          </Lead>
        </Container>
      </section>

      <Container className="space-y-24 pb-32">
        <Group title="Cores" description="Use sempre pelo nome do token (bg-surface, text-ink-muted…), nunca o hex.">
          <div className="grid gap-8 md:grid-cols-2">
            {COLORS.map(([group, names]) => (
              <div key={group} className="space-y-3">
                <Muted>{group}</Muted>
                <div className="grid grid-cols-5 gap-3">
                  {names.map((n) => (
                    <div key={n} className="space-y-1.5">
                      <div className="aspect-square rounded-xl ring-1 ring-black/5 ring-inset" style={{ background: `var(--color-${n})` }} />
                      <Code className="block truncate">{n}</Code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Group>

        <Group title="Tipografia" description="Inter Tight para tudo, Fragment Mono para caminhos e valores técnicos. Títulos em peso 400 com tracking negativo.">
          <div className="space-y-6 divide-y divide-line">
            <Heading size="display">Fotos que vendem</Heading>
            <Heading size="title" className="pt-6">
              Escolha as melhores
            </Heading>
            <Heading size="heading" className="pt-6">
              O que você quer criar?
            </Heading>
            <Lead className="pt-6">Lead — texto de apoio abaixo de títulos, em cinza quente.</Lead>
            <p className="pt-6 text-sm text-ink">Corpo — texto normal de interface, 14px.</p>
            <Code className="block pt-6">products/create/cavalo-carrossel</Code>
          </div>
        </Group>

        <Group title="Botões" description="Um único primário escuro por tela. Secundário em branco com linha fina.">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">
              Criar imagem <Icon icon={ArrowRight} />
            </Button>
            <Button>Secundário</Button>
            <Button variant="soft">Suave</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="success">Sucesso</Button>
            <Button variant="danger">Excluir</Button>
            <Button variant="primary" disabled>
              Desativado
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Pequeno</Button>
            <Button size="md">Médio</Button>
            <Button size="lg" variant="primary">
              Grande
            </Button>
          </div>
        </Group>

        <Group title="Etiquetas e ícones">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Neutra</Badge>
            <Badge dot tone="accent">
              Seção
            </Badge>
            <Badge dot tone="success">
              Aprovada
            </Badge>
            <Badge dot tone="warning">
              Criando…
            </Badge>
            <Badge dot tone="danger">
              Falhou
            </Badge>
            <span className="rounded-full bg-lake p-1">
              <Badge dot tone="dark">
                Sobre imagem
              </Badge>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(["peach", "rose", "lilac", "mint", "sun", "sky", "neutral"] as const).map((t) => (
              <IconTile key={t} icon={Wand2} tone={t} />
            ))}
            <Swatch color="#e9a0b8" className="size-6" />
            <Spinner />
          </div>
        </Group>

        <Group title="Formulários">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Nome do produto" hint="Aparece só para você.">
              <Input placeholder="Ex.: Topo de bolo Amália" />
            </Field>
            <Field label="O que a IA nunca pode mudar" optional>
              <Textarea placeholder="Ex.: o nome 'Amália'" />
            </Field>
            <Field label="Escolha única">
              <ChoiceGroup
                value={single}
                onChange={setSingle}
                options={[
                  { value: "shopee", label: "Shopee" },
                  { value: "ml", label: "Mercado Livre" },
                ]}
              />
            </Field>
            <Field label="Várias escolhas">
              <ChoiceGroup
                multiple
                value={multi}
                onChange={setMulti}
                options={[
                  { value: "1x1", label: "1:1" },
                  { value: "3x4", label: "3:4" },
                  { value: "16x9", label: "16:9" },
                ]}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <OptionCard icon={SunMedium} tone="sun" title="Fundo branco" description="Cartão selecionável para escolher o que fazer." selected={mode === "white"} onSelect={() => setMode("white")} />
            <OptionCard icon={Palette} tone="lilac" title="Outras cores" description="Ícone em quadrado pastel, título e uma linha." selected={mode === "color"} onSelect={() => setMode("color")} />
            <Dropzone onFiles={() => {}} title="Dropzone" />
          </div>
        </Group>

        <Group title="Navegação e feedback">
          <Stepper
            current={step}
            onSelect={setStep}
            steps={[
              { id: "photos", label: "Fotos", done: true },
              { id: "create", label: "Criar" },
              { id: "review", label: "Escolher", badge: <Badge tone="warning">3</Badge> },
              { id: "publish", label: "Publicar" },
            ]}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <Alert>Informação neutra.</Alert>
            <Alert tone="success">Arquivos prontos.</Alert>
            <Alert tone="danger" onClose={() => {}}>
              Algo deu errado.
            </Alert>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card tone="surface" className="space-y-3 p-5">
              <Muted>Progresso indeterminado (IA trabalhando)</Muted>
              <Progress />
              <Muted>Progresso com valor</Muted>
              <Progress value={0.6} />
            </Card>
            <Card className="p-5">
              <Disclosure summary="Opções avançadas" defaultOpen>
                <Muted>Conteúdo que a maioria das pessoas pode ignorar fica aqui dentro.</Muted>
              </Disclosure>
            </Card>
          </div>
          <EmptyState icon={PackageOpen} title="Estado vazio" description="Explica o que falta e oferece uma única ação." action={<Button variant="primary">Ação</Button>} />
        </Group>

        <Group title="Cartões e colunas">
          <div className="grid gap-3 md:grid-cols-4">
            {(["plain", "surface", "panel", "float"] as const).map((t) => (
              <Card key={t} tone={t} className="p-5">
                <Code>tone=&quot;{t}&quot;</Code>
              </Card>
            ))}
          </div>
          <FeatureGrid
            features={[
              { icon: Camera, title: "Colunas com linha fina", description: "Ícone fino, título e texto curto." },
              { icon: Wand2, title: "Espaço generoso", description: "Deixe o conteúdo respirar." },
              { icon: MousePointerClick, title: "Uma ação por vez", description: "Nada de telas cheias de botões." },
              { icon: Download, title: "Linguagem simples", description: "Sem termos técnicos na tela principal." },
            ]}
          />
        </Group>

        <Group title="Fundos pintados" description="Paisagens em SVG com borda de pincel e grão de papel; troque por uma pintura real com a prop image.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="relative h-72 overflow-hidden rounded-panel">
              <PaintedBackdrop scene="meadow" fade={false} />
              <Code className="absolute bottom-4 left-4 rounded-full bg-canvas/80 px-3 py-1">scene=&quot;meadow&quot;</Code>
            </div>
            <div className="relative h-72 overflow-hidden rounded-panel">
              <PaintedBackdrop scene="sky" fade={false} />
              <Code className="absolute bottom-4 left-4 rounded-full bg-canvas/80 px-3 py-1">scene=&quot;sky&quot;</Code>
            </div>
          </div>
        </Group>
      </Container>
    </>
  );
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-8 border-t border-line pt-10">
      <SectionHeader size="heading" title={title} description={description} />
      {children}
    </section>
  );
}
