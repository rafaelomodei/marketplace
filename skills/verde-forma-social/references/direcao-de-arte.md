# Verde Forma — direção de arte e composição para posts

**Papel:** instrução operacional do planejador de layout, gerador de cena e compositor gráfico.  
**Objetivo:** reproduzir a gramática visual aprovada — editorial de produto, fotografia lifestyle e tipografia elegante — sem copiar rigidamente um anúncio nem alterar o produto.

**Referência visual canônica:** `../assets/referencia-post-vela-2-anos.png`. O pipeline anexa esse arquivo automaticamente a todos os jobs sociais. Copiar sua gramática de composição, proporções, tipografia, paleta, profundidade e acabamento — não copiar o produto ou os textos quando o briefing for diferente.

## Regra mestra e prioridade

Preservar o produto original. Pode-se deslocar, enquadrar ou reambientar a fotografia, mas nunca alterar silenciosamente geometria, decoração, cores, inscrições, quantidade de elementos ou proporções.

Não completar o objeto por conhecimento de categoria. “Vela” não implica pavio aceso; “topo de bolo” não implica haste; “vaso” não implica flores. Chama, faísca, pavio, encaixes, suportes e acessórios só existem se estiverem visíveis no produto de referência ou forem pedidos explicitamente.

Ordem inviolável:

1. Produto fiel à referência real.
2. Texto factual e exato; não inventar preço, material, dimensão, estoque, entrega ou personalização.
3. Logo oficial importada do filesystem; nunca gerada ou redesenhada.
4. Legibilidade e zonas de segurança.
5. Direção de arte, assimetria, cores e ornamentos.

## Gramática visual

- Assimetria intencional: em geral, produto grande em um lado e texto concentrado no lado oposto.
- Produto protagonista, grande e nítido; texto não cobre nenhuma parte importante.
- Hierarquia: título > produto/contexto > apoio > CTA > marca.
- Cenário em bokeh suave, produto e primeiro plano nítidos.
- Cores de marca pertencem à interface; as cores reais do produto ficam intocadas e não migram para headline ou CTA.
- Poucos ornamentos lineares desenhados à mão.
- Espaço negativo reservado antes da geração da cena.
- Resultado deve parecer fotografia comercial real com direção editorial, não filtro ou card genérico.

O objeto não precisa ficar sempre à direita. Escolher variante conforme formato e integridade da referência.

## Blueprint canônico — feed vertical 4:5

Canvas: 1080 × 1350. Coordenadas são normalizadas e adaptáveis.

| Elemento | Caixa aproximada | Tratamento |
|---|---|---|
| Título | x 6–48%; y 7–32% | 2–4 linhas, alinhado à esquerda |
| Sublinhado/coração | x 6–43%; y 31–34% | traço orgânico fino e opcional |
| Apoio | x 7–41%; y 36–50% | 3–5 linhas curtas |
| Produto | x 43–95%; y 17–79% | grande, inteiro, nítido e sem texto por cima |
| Contexto/superfície | x 0–100%; y 62–100% | primeiro plano realista e subordinado |
| CTA | x 6–49%; y 83–89% | cápsula caramelo discreta |
| Logo | x 7–34%; y 91–97% | asset oficial pequeno; omitir quando ausente |
| Ornamentos | cantos/vazios | esparsos, sem invadir texto ou produto |

Parâmetros:

- Margem externa: 5–7% W.
- Texto principal: 35–43% W em composição dividida.
- Produto: 50–65% W e 55–70% H.
- Respiro texto/produto: mínimo 2–4% W.
- Título: 3,5–5× o corpo, ajustado ao comprimento.
- Produto em layout A: âncora inicial próxima a `(0.68W, 0.47H)`.
- Marca subordinada ao título e ao produto.
- Ornamentos: no máximo 3–6 motivos pequenos; reduzir quando o produto for colorido.

Antes de gerar, identificar silhueta e orientação reais. Não inventar rotação ou face não mostrada. Produto alto pede enquadramento vertical; produto largo pede título menor ou faixa superior/inferior. Nunca distorcer o produto para fazê-lo caber.

## Variantes

- **A — editorial assimétrico preferencial:** texto à esquerda, produto à direita, CTA inferior.
- **B — espelhado:** produto à esquerda, texto à direita, quando a orientação da referência pedir.
- **C — hero central:** produto central por simetria/formato; título no topo e textos abaixo sem sobreposição.
- **D — close-up premium:** produto domina o quadro; apenas título curto ou logo; remover CTA se faltar espaço.
- **E — carrossel:** capa editorial; páginas seguintes priorizam detalhe e informação concreta.

Não escolher A cegamente. Registrar mentalmente a justificativa da variante.

## Tipografia exata por papel

| Papel | Família | Estilo | Cor |
|---|---|---|---|
| Título | Playfair Display | Regular/Semibold; itálico pontual | verde-oliva escuro |
| Ênfase curta | Playfair Display Italic | uma palavra/expressão | caramelo quente |
| Apoio | Poppins | Regular/Medium | verde-oliva médio |
| CTA | Poppins | Medium | creme/branco |
| Rodapé | Poppins | Regular | verde médio |
| Wordmark | asset oficial | não digitar | cor original |

Paleta operacional:

- creme `#F6F0E7`; branco quente `#FAF8F3`;
- verde-oliva `#646B45`; verde escuro `#2E5939`;
- caramelo `#BC8756`; caramelo profundo `#AA7449`;
- sálvia `#A7B89F`; rosa `#E8B7C0`; lilás `#C9B4E5`.

As cores azul, verde, amarelo, laranja ou outras do produto não podem colorir elementos de interface fora dessa paleta.

Título:

- 2–4 linhas, alinhamento à esquerda, entrelinha apertada e confortável.
- Verde-oliva; uma palavra/expressão curta pode ser caramelo e itálica.
- Sem sombra pesada, contorno, neon, gradiente ou fonte display genérica pesada.
- Para 1080 × 1350: 74–112 px como ponto de partida.

Apoio:

- Logo abaixo do título/ornamento, até 90–120 caracteres quando couber.
- Quebras por unidade semântica; entrelinha 1,3–1,5.
- Para 1080 × 1350: 29–38 px.

CTA: 27–35 px. Informação auxiliar: 19–27 px. Ajustar sem colisão e validar em tela pequena.

## Fotografia e ambientação

- Macro/lifestyle de produto artesanal, luz natural difusa quente-neutra, baixa profundidade de campo.
- Produto nítido, texturas reais e contornos definidos.
- Fundo cremoso, baixa saturação, contraste moderado.
- Contextualizar o uso sem competir com o produto.
- Atrás do texto, manter área clara e simples.
- Sem HDR, nitidez digital excessiva ou brilho plástico fictício.
- Primeiro plano pode desfocar levemente, nunca escondendo informação.
- Profundidade: foto 3D + letras planas 2D + ornamentos lineares 2D.
- Não adicionar folhas por hábito; ornamento deve ter relação com o tema.

Fluxo preferencial da imagem:

1. Isolar/preservar a peça original quando tecnicamente possível.
2. Manter seus pixels essenciais em camada independente.
3. Criar cenário atrás dela, respeitando o plano espacial.
4. Compor sombra e contato sem modificar cor ou geometria.
5. Aplicar tipografia, CTA, ornamentos e logo em camadas controladas.

## Ornamentos

Line art editorial orgânica, curva levemente irregular e espessura uniforme de 1,5–3 px a 1080 px.

Usar somente o que for semanticamente pertinente: coração contínuo, arco/sublinhado, 2–3 estrelas simples, pontos radiantes ou 1–2 ramos periféricos. Cores: oliva, sálvia ou caramelo. Não encostar nas letras.

Proibidos: emojis, ícones 3D, sombras em ícones, stickers, doodles infantis carregados e mistura de bibliotecas.

## CTA

Somente quando fornecido e factual. Cápsula horizontal caramelo no rodapé do lado do texto:

- referência: `left 6%`, `top 83%`, largura 37–44% W, altura 4,4–5,2% H;
- raio 999 px, fundo `#BC8756`, Poppins Medium creme/branco;
- seta fina à direita, padding proporcional;
- sem brilho, contorno chamativo ou sombra elevada;
- nunca sobrepor o produto.

Se vazio, remover o componente e redistribuir o espaço. Não inventar CTA.

## Logo

- Importar SVG/PNG transparente oficial de caminho configurado.
- Nunca gerar, redesenhar ou substituir por flor/folha.
- Referência: 15–25% W, margem mínima 5% W, pequena sob o CTA.
- Sem asset: exportar sem marca; não deixar placeholder nem logo falsa.

## Método obrigatório

### 1. Planejador de composição

Antes da geração, definir variante, caixas normalizadas de produto/título/apoio/CTA/logo, margem, paleta e ornamentos. Alocar primeiro o produto e depois textos sem interseção.

### 2. Gerador de cena

Gerar/editar fotografia sem texto, botão ou logo: cenário, iluminação, lente, bokeh, espaço negativo, máscara e fidelidade do produto.

### 3. Compositor gráfico

Aplicar texto exato, CTA, ornamentos e logo como camadas 2D controladas. Quando o ambiente não oferecer composição determinística real, instruir o gerador a manter aparência de camadas planas e validar rigorosamente; nunca alegar precisão vetorial inexistente.

### 4. QA

Pontuar antes de entregar:

| Critério | Resultado |
|---|---:|
| Produto fiel | bloqueante |
| Texto exato | bloqueante |
| Logo oficial, se exigida | bloqueante |
| Hierarquia título > apoio > CTA > assinatura | 0–2 |
| Produto grande, focado e sem sobreposição | 0–2 |
| Variante/asimetria justificada | 0–2 |
| Respiro e leitura móvel | 0–2 |
| Tipografia e paleta | 0–2 |
| Ornamentos discretos | 0–2 |
| Luz e cenário realistas | 0–2 |

Qualquer bloqueio reprova. Demais critérios precisam somar pelo menos 14/16; abaixo disso, revisar antes de entregar.

## Interpretação do briefing

1. Identificar produto e orientação.
2. Escolher a variante de maior fidelidade.
3. Criar caixas sem interseção.
4. Ajustar hierarquia à quantidade real de texto.
5. Usar no máximo 1–2 acentos sobre base neutra.
6. Escolher somente ornamentos pertinentes.
7. Adicionar CTA apenas se informado.
8. Importar logo real apenas se disponível.
9. Renderizar e executar QA factual/visual.

Campos vazios não geram rótulos, placeholders, blocos ou reserva visual.

## Caso concreto: vela de dois anos

```yaml
format: 1080x1350
layout_variant: A
purpose: destacar vela decorativa de aniversário de 2 anos com foguete
title: 2 aninhos rumo às estrelas!
support_text: Uma vela especial para celebrar dois anos de descobertas, sonhos e aventuras.
cta: Personalize a sua conosco!
composition:
  headline_side: left
  product_side: right
  product_anchor_normalized: [0.68, 0.47]
  safe_margin_w: 0.06
  ornament_density: low
scene:
  context: bolo de aniversário branco
  lighting: quente-neutra, natural, difusa
  background: creme com bokeh e baixa saturação
typography:
  title: Playfair Display
  body: Poppins
  emphasis_word: estrelas!
  emphasis_color: "#BC8756"
```

“Personalize” só pode existir quando essa oferta estiver confirmada no briefing.

## Rejeitar imediatamente

- Produto pequeno/central sem justificativa; texto espalhado.
- Texto sobre produto ou detalhe essencial.
- Produto rotacionado, deformado ou recriado sem autorização.
- Cards grandes atrás de texto ou muitos blocos.
- Título em sans bold ou fonte pesada genérica.
- Três ou mais fontes decorativas.
- Botão enorme, saturado, glossy ou com sombra de aplicativo.
- Logo falsa ou símbolo inventado.
- Folhas/ícones aleatórios ocupando o quadro.
- Cores do produto reutilizadas como interface.
- Campo vazio renderizado como rótulo.
- Informação comercial inventada.
- Fundo que impede leitura.
- Aparência de screenshot do Instagram.
