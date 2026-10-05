# Marketplace Studio

App local para criar as **imagens de anúncio** dos produtos impressos em 3D, para Shopee (e, depois, Mercado Livre).

Você coloca as **fotos reais** do produto e as **referências de estilo/cenário**. O app pede ao **Codex CLI** para gerar as
imagens do anúncio sem mudar o produto: forma, textos, detalhes e textura continuam os mesmos. Depois você aprova as
melhores e exporta nas proporções que o marketplace pede.

![Demonstração do Marketplace Studio](docs/demo.gif)

> Sem API key e sem nuvem: tudo roda no seu PC. A geração usa o `codex exec` com a sua conta do ChatGPT.

## Funcionalidades

### Produtos organizados em pastas
- Cada produto é uma pasta em `products/create/<produto>/`, com subpastas para fotos reais, estilos, candidatas, aprovadas e exportações.
- `products/` fica fora do Git (`.gitignore`): as fotos e os pedidos ficam só na sua máquina. Numa instalação nova, a pasta é criada automaticamente.
- A pasta é a fonte da verdade: imagens copiadas pelo explorador de arquivos aparecem no app, e as apagadas somem dele.
- **Marcar como pronto** move o produto para `products/ready/`, com tudo aprovado e exportado.

### Referências
- Arraste e solte as **fotos reais** do produto impresso (mais ângulos = mais fidelidade).
- Arraste e solte os **cenários de referência**. A cena é mantida igual (fundo, props, luz, enquadramento) e só o objeto-alvo é trocado pelo seu produto.
- O campo **"O que NUNCA pode mudar"** (ex.: *o nome "Amália" e o número "1"*) entra em todos os prompts.

### Geração com IA (Codex)
| Modo | O que faz |
|---|---|
| **Fundo branco** | Packshot em fundo `#FFFFFF`, luz de estúdio e sombra suave. Remove mãos, paredes e tecidos da foto original. |
| **Cenário de referência** | **Edita** a imagem de cenário: troca só o objeto-alvo (você diz qual, ou o app usa o mais parecido) pelo seu produto e mantém todo o resto igual. |
| **Variação de cor** | Recria a imagem trocando só as cores pelos **filamentos Voolt3D** escolhidos. As fotos reais do filamento vão junto como referência de cor e acabamento. Várias escolhas geram uma imagem por combinação. |
| **Reenquadrar com IA** | Estende o cenário para outra proporção (ex.: 3:4) em vez de cortar. |

- Você escolhe o formato da imagem principal (1:1, 3:4 ou igual ao cenário).
- **Alterações permitidas**: qualquer mudança além da tarefa do modo precisa ser escrita aqui. Só muda o que estiver escrito; todo o resto fica igual às imagens de entrada.
- Há uma **fila de jobs** com **log do Codex ao vivo**, tempo decorrido e botão de cancelar. Jobs interrompidos por um reinício do servidor voltam para a fila.
- Cada imagem leva de ~1 a 3 min.

### Revisão das candidatas
- Mostra a imagem gerada ao lado das imagens que o Codex recebeu, para comparar a fidelidade.
- **Aprovar** (copia para `approved/`), **Rejeitar**, **Desfazer** e **Gerar outra** (com os mesmos parâmetros).
- Filtros: para revisar, aprovadas, rejeitadas e todas. O prompt usado em cada imagem fica visível.

### Exportação para o marketplace
- Presets por marketplace em `config/marketplaces.json`. Shopee: **1:1 (1200×1200)** e **3:4 (1200×1600)**, em JPG.
- **Automático**: imagens com borda branca são completadas com branco (nada é cortado) e cenários recebem **recorte inteligente** (focado na região de interesse).
- Arquivos finais em `exports/<marketplace>/<proporção>/`.

### Skill de geração
- As regras que o Codex segue ficam em [`skills/marketplace-product-image/SKILL.md`](skills/marketplace-product-image/SKILL.md): mudar o mínimo possível, fidelidade do produto e do cenário, regras de cada modo e uma conferência antes de entregar (o Codex compara o resultado com as entradas e gera de novo se algo mudou).
- A skill vai em todo job, e editar o arquivo vale a partir do próximo job. Ela também pode ser instalada direto no Codex: `ln -s "$PWD/skills/marketplace-product-image" ~/.codex/skills/`.

### Filamentos Voolt3D
- `pnpm filaments:sync` lê o catálogo de PLA da [Voolt3D](https://voolt3d.com.br/pla/) (High Speed, EVO, Velvet, Macaron, V-Silk, Neon, Stone, Wood, Tri Color e Shadow) e gera `config/filaments.json` com cor, linha, acabamento e tags.
- As fotos de cada filamento (peça impressa, carretel) são baixadas para `assets/filaments/voolt3d/` (fora do Git). O hex vem da lateral do carretel na foto.
- No seletor, as cores ficam agrupadas por linha e mostram a foto real da peça. Para corrigir uma cor, adicione `"hexOverride"` no JSON; a próxima sincronização preserva o campo.

## Estrutura de pastas

```
products/
  create/<produto>/          # em criação
    product.json             # nome, descrição e "o que nunca pode mudar"
    real/                    # fotos reais do produto impresso
    style-refs/              # cenários de referência (editados, só o objeto-alvo muda)
    generated/<job>.png      # candidatas geradas pelo Codex
    approved/                # cópias das candidatas aprovadas
    exports/shopee/1x1/…     # arquivos finais para o marketplace
    exports/shopee/3x4/…
  ready/<produto>/           # produtos finalizados
config/filaments.json        # catálogo de filamentos Voolt3D (gerado por pnpm filaments:sync)
assets/filaments/            # fotos dos filamentos (baixadas, fora do Git)
skills/                      # skill de geração enviada ao Codex
config/marketplaces.json     # proporções/tamanhos por marketplace
data/                        # SQLite (status, histórico, fila), logs dos jobs, miniaturas — pode apagar
```

## Instalação

Requisitos: Node 20+, pnpm e o Codex CLI logado (`codex login`) com `image_generation` ativo
(`codex features list | grep image_generation`).

```bash
pnpm install
pnpm dev                          # desenvolvimento em http://localhost:3456
scripts/install-service.sh        # instala como serviço systemd do usuário (sobe junto com o PC)
```

- Serviço: `systemctl --user status marketplace-studio` · logs: `journalctl --user -u marketplace-studio -f`
- O servidor só escuta em `127.0.0.1` (não fica exposto na rede).
- Se trocar a versão do Node (nvm), rode o `install-service.sh` de novo, porque o serviço guarda o caminho do Node.
- Para subir antes de fazer login: `sudo loginctl enable-linger $USER`.

## Como a geração funciona

1. O prompt é a **skill** + uma ficha do job montada em `lib/prompts.ts` (papel de cada imagem, tarefa, objeto-alvo, formato e alterações permitidas).
2. `lib/engine/codex.ts` roda `codex exec --json -s workspace-write -C data/jobs/<id> -i <imagens…>`, com o prompt pelo stdin.
3. O Codex salva o resultado como `output.png`. Se não salvar, o app pega a imagem mais nova em `~/.codex/generated_images/<sessão>/`.
4. A imagem vai para `generated/<job>.png` e aparece em Candidatas.

A fila roda uma imagem por vez. Use `STUDIO_CONCURRENCY=2` para paralelizar. Outras variáveis opcionais:
`STUDIO_ROOT`, `CODEX_BIN`, `CODEX_HOME`.

## Interface e design system

- Fluxo guiado em 4 passos (**Fotos → Criar → Escolher → Publicar**) com um cartão de **próximo passo** sempre visível; detalhes técnicos (prompt, log do Codex) ficam recolhidos.
- Design system **Ateliê** (inspirado em [duna.com](https://duna.com)): neutros quentes, títulos leves, botões em pílula e paisagens pintadas em SVG. Componentes em `components/ui` (atomic design: atoms → molecules → organisms → templates), tokens em `app/globals.css` e catálogo vivo em [`/design-system`](http://localhost:3456/design-system).
- Regras para contribuir (reuso de componentes, tokens, ações) em [`CLAUDE.md`](CLAUDE.md).

## Preparado para MCP

Cada operação é uma ação tipada em `lib/actions/` (nome, descrição, schema zod). As rotas da API usam essas ações, e `GET /api/actions` lista todas com JSON Schema — a base para um servidor MCP futuro. Ver [`docs/mcp.md`](docs/mcp.md).

## Stack

Next.js 15 (App Router) + TypeScript · Tailwind CSS 4 · lucide-react · zod · SQLite (better-sqlite3) · sharp · Codex CLI · Vitest

## Desenvolvimento

```bash
pnpm test        # vitest: sync de pastas, aprovação, exportação, prompts e ações
pnpm typecheck
pnpm filaments:sync  # atualiza o catálogo e as fotos dos filamentos Voolt3D
pnpm demo        # regrava docs/demo.gif (precisa do app rodando, do Google Chrome e do ffmpeg; não altera nada)
```
