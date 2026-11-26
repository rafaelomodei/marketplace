# Verde Forma — direção de arte das peças sociais

Referência para pessoas. O pipeline não envia este arquivo à IA: a fotografia segue `../SKILL.md` e a camada gráfica é desenhada por código em `lib/social-design.ts`.

## Como uma peça é feita

1. **Fotografia (IA, via Codex/`image_gen`)** — produto fiel às fotos, integrado à cena com luz e sombra reais, à direita; áreas de título (alto à esquerda) e rodapé (baixo à esquerda) livres e claras; nenhum texto ou logo. As peças em `../assets/exemplos/` vão junto como referência de estilo.
2. **Camada gráfica (código)** — sempre igual, letra por letra:
   - Título: Playfair Display 400, 96 px no feed (84 px no quadrado), reduz até 60 px se não couber em 3 linhas; verde-oliva `#4F5732`. A última linha sai em itálico caramelo `#B07A48`; títulos de uma linha são divididos em duas. `|` força a quebra.
   - Apoio: Poppins 400, 34 px (até 26 px), grafite `#4A4C3B`, até 5 linhas.
   - CTA: cápsula `#BC8756`, 66 px de altura, Poppins 500 28 px em `#FAF8F3`, até 440 px de largura.
   - Logo: `../assets/logos/oficial/assinatura-verdeforma.png`, 54 px de altura, proporção original, cores intactas, canto inferior esquerdo (margem 72 px).
   - Se a foto ficar escura ou movimentada atrás de um texto, um véu creme suave sobe da borda esquerda para manter a leitura.
3. **Correção** — edita `photo.png` (a foto limpa guardada na pasta do job) e reaplica a mesma camada gráfica.

## Zonas (canvas final, 1080 px de largura)

| Formato | Canvas | IA gera em | Título começa em | Rodapé (base) |
|---|---|---|---|---|
| Feed 4:5 | 1080 × 1350 | 1024 × 1536 (recorte central) | y 92 | y 1290 |
| Feed 1:1 | 1080 × 1080 | 1024 × 1024 | y 64 | y 1028 |
| Vertical 9:16 | 1080 × 1920 | 1024 × 1536 (recorte central) | y 269 (14%) | y 1536 (80%) |

Título até 500 px de largura (480 no quadrado); produto a partir de 54% da largura, inteiro e grande.
