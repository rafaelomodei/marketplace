# Marketplace Studio — regras do projeto

## Antes de criar qualquer coisa: procure o que já existe
- Componente visual → `components/ui/index.ts` (design system) e `components/studio/index.ts` (domínio). Catálogo vivo em `/design-system` (interno: só por URL, fora do menu).
- Função/regra de negócio → `lib/` (`products.ts`, `jobs.ts`, `prompts.ts`, `export.ts`, `workflow.ts`, `client/api.ts`, `cn.ts`).
- Se algo parecido existe, estenda (nova variante/prop) em vez de duplicar. Algo novo usado em 2+ lugares vira componente/função compartilhada.

## Design system "Ateliê" (atomic design)
- `components/ui/atoms` → `molecules` → `organisms` → `templates`. Genéricos, sem regra de negócio; um átomo nunca importa uma molécula.
- `components/studio/` → organismos do domínio (produto, job, filamento), montados só com `components/ui`.
- `app/**` → páginas que compõem os dois. Componente só daquela página fica ao lado dela.
- Fontes vêm de pacotes `@fontsource` (locais); não use `next/font/google`, que baixa da internet no build.
- Cores, fontes, raios e sombras são tokens em `app/globals.css` (`@theme`). Use as classes (`bg-surface`, `text-ink-muted`, `rounded-card`, `text-display`), nunca hex solto.
- Essência (inspirada em duna.com): neutros quentes, títulos grandes em peso 400 com tracking negativo, botões em pílula (um único primário escuro por tela), linhas finas, muito respiro, paisagens pintadas (`PaintedBackdrop`), ícones lucide finos (`Icon`, `IconTile`).

## Simplicidade para quem não é técnico
- Linguagem simples na tela; termos técnicos (prompt, log do Codex, pastas) ficam em `Disclosure` ("Detalhes", "Opções avançadas").
- Uma ação recomendada por vez: `lib/workflow.ts` (`nextStep`) decide; a UI (`NextStepCard`) e os agentes (`get_next_step`) usam a mesma função.
- Padrões sensatos já selecionados (fotos marcadas, tamanhos do marketplace, formato).

## Ações (base para MCP)
- Toda operação é uma ação em `lib/actions/` (`defineAction`: nome snake_case, descrição para LLM, schema zod, `run`).
- Rotas da API são adaptadores finos: `runAction(acao, input)`. Nada de regra de negócio em `app/api/**`.
- Nova operação = nova ação registrada em `lib/actions/index.ts` (vira ferramenta MCP automaticamente). Ver `docs/mcp.md`.

## Verificação
`pnpm typecheck && pnpm test`. O serviço systemd `marketplace-studio` roda `next start` na porta 3456 usando `.next/` —
não rode `next dev`/`next build` na pasta do projeto sem avisar (sobrescreve o build do serviço).
