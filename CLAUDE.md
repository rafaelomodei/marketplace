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

## Lab (ferramentas paramétricas)
- Área separada em `/lab` (o logo vira "Lab"; o seletor Studio | Lab fica no `AppHeader`).
- Cada ferramenta = pasta em `lib/lab/tools/<id>/` com o modelo `.scad` (código próprio — não copie modelos de terceiros)
  e a definição (`LabTool`: parâmetros, peças/cores, validação). Registre em `lib/lab/tools/index.ts`.
- Ferramentas de "nome sobre base de contorno" reaproveitam `lib/lab/scad/name-tag.scad` (linhas, ícone, contorno, encaixes)
  e `lib/lab/tools/shared/name-tag.ts` (parâmetros, peças, arquivos); a ferramenta só acrescenta a sua parte (argola, alça…).
- O formulário, o 3D e os downloads vêm prontos do `ToolWorkbench`; parâmetros novos só precisam de um tipo em `lib/lab/params.ts`.
- OpenSCAD roda em WebAssembly (`lib/lab/engine.ts`): no navegador via Web Worker e no Node para as ações (`list_lab_tools`, `render_lab_model`).
- Fontes em `public/lab/fonts/` (`pnpm lab:fonts`), só licenças livres para uso comercial (OFL/Apache).

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
