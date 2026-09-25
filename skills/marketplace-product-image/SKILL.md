---
name: "marketplace-product-image"
description: "Gera imagens de anúncio (Shopee / Mercado Livre) de produtos impressos em 3D a partir de fotos reais do produto e de uma imagem de cenário de referência, preservando ao máximo o produto E o cenário. Use junto com a skill imagegen quando o job do Marketplace Studio pedir fundo branco, cenário, variação de cor ou reenquadramento."
---

# Imagens de anúncio com fidelidade máxima

Você recebe imagens numeradas e um JOB. Seu trabalho é **editar o mínimo possível** para chegar no que o JOB pede.
Use a ferramenta nativa `image_gen` (skill imagegen). Nunca desenhe com código e nunca devolva placeholder.

## 1. Regra de ouro: só muda o que foi pedido

Existem duas fontes de verdade e as duas são intocáveis:

- **O PRODUTO**: as fotos reais do objeto impresso.
- **O CENÁRIO**: a imagem de referência ou a imagem base do job.

Mudanças permitidas:

1. A mudança que define o modo do job (ex.: trocar o objeto-alvo pelo produto).
2. O que estiver escrito em **ALTERAÇÕES PERMITIDAS**, e só isso.

Qualquer outra diferença é um erro. Na dúvida, **não mude**. Não "melhore", não embeleze, não reinterprete.

## 2. Fidelidade do produto (sempre)

- As fotos do produto mostram o **mesmo objeto** em ângulos diferentes. Use todas para entender a forma.
- Reproduza exatamente: silhueta, geometria, proporções, espessura, quantidade e posição de cada peça, cores de cada parte, acabamento (fosco/silk), linhas de camada da impressão 3D e textura da superfície.
- Textos, nomes e números: **letra por letra**, mesma fonte, mesmo estilo, mesma posição. Nunca traduza, corrija ou invente texto.
- Proibido: redesenhar, simplificar, estilizar, suavizar detalhes, adicionar ou remover elementos, adicionar logos, marcas d'água ou texto novo.
- Ignore o que não é o produto nas fotos reais: mãos, dedos, paredes, tecidos, mesa. Isso nunca vai para a imagem final.
- As "Notas do vendedor" sobre o produto têm prioridade máxima.

## 3. Fidelidade do cenário (modos cenário, cor e reenquadrar)

Trate a imagem de cenário como **alvo de edição**, não como inspiração. Mantenha idêntico:

- enquadramento, ângulo, altura e distância da câmera, perspectiva e lente;
- composição e posição de todos os elementos;
- fundo, superfícies, móveis, props, decoração, tecidos, plantas e comida: mesma quantidade, forma, cor e lugar;
- iluminação: direção, dureza, temperatura de cor, sombras e reflexos existentes;
- paleta, contraste, profundidade de campo, desfoque, granulação e estilo fotográfico;
- proporção da imagem (a não ser que o job peça outro formato).

Na substituição:

- Troque **somente o objeto-alvo** pelo produto, na mesma posição e na mesma orientação geral.
- Use uma escala realista para o produto (use as dimensões informadas, se houver). Se precisar, ajuste o tamanho **do produto**, nunca a cena.
- Integre com a luz da cena: sombra de contato, sombra projetada na mesma direção das outras, reflexos coerentes e mesmo foco do plano onde ele está.
- Se o produto ocupar menos área que o objeto removido, reconstrua o fundo atrás de forma coerente com o resto da cena.
- Não adicione nem remova nenhum outro elemento. Não mude cores, textos ou objetos do cenário.

## 4. Modos

### Fundo branco (`white-bg`)
- Packshot de e-commerce: fundo branco puro e uniforme (#FFFFFF), sem gradiente, sem textura e sem horizonte visível.
- Luz de estúdio suave e uniforme, com sombra de contato sutil logo abaixo do produto.
- O produto ocupa cerca de 80% da maior dimensão, inteiro, centralizado e sem cortes.
- Ângulo igual ao da melhor foto real (a mais frontal e completa), a não ser que as alterações permitidas digam outro.

### Cenário (`scene`)
- Imagem 1 = cenário (alvo da edição). As imagens seguintes = produto.
- Objeto-alvo = o que o job indicar em "OBJETO A SUBSTITUIR". Se não indicar, é o objeto da cena mais parecido com o nosso produto (mesma função/categoria). Se não houver objeto parecido, coloque o produto no ponto focal natural da cena, sem remover nada.
- Todo o resto segue a seção 3.

### Variação de cor (`recolor`)
- Imagem 1 = imagem base. Recrie-a **idêntica** e troque apenas as cores das partes listadas pelos filamentos indicados.
- Neste modo, as **cores** que as notas do vendedor descrevem podem mudar; formas, textos e detalhes das notas continuam valendo.
- As partes não listadas mantêm a cor original. Os textos continuam com a mesma cor, a não ser que a parte listada seja o texto.
- As imagens de **REFERÊNCIA DE COR** são fotos reais do filamento (peça impressa e lateral do carretel). Copie delas **só** a cor (tom, saturação, brilho) e o **acabamento** da superfície; ignore a forma do objeto e o carretel.
- O acabamento indicado precisa aparecer: Velvet/Macaron = fosco aveludado com camadas quase invisíveis; V-Silk = brilho sedoso e reflexivo; Neon = cor fluorescente saturada; Stone = mineral fosco com grânulos; Wood = fibras e poros de madeira; Tri Color / Shadow = as cores mudam ao longo da peça como na foto de referência.
- O hex informado é aproximado. Se ele e a foto divergirem, vale a **foto**.
- Cenário, enquadramento, luz e sombras idênticos (seção 3).

### Reenquadrar (`reframe`)
- Imagem 1 = imagem base. Mude só o formato do quadro, estendendo o cenário para as bordas novas.
- A região original fica idêntica. O produto não muda de tamanho, posição relativa nem detalhe, e nunca é cortado.

## 5. Formatos
- `1:1`: tela quadrada (1024x1024).
- `3:4`: tela retrato (1024x1536), com margem livre em cima e embaixo, porque depois é recortada para 3:4.
- `ref`: mesma proporção da imagem de cenário (use o tamanho suportado mais próximo).

## 6. Conferência antes de entregar

Depois de gerar, abra a imagem (view_image) e compare com as entradas:

1. O texto do produto está letra por letra igual?
2. A quantidade de peças, as cores e os detalhes do produto batem?
3. Nos modos com cenário: todos os elementos da cena continuam lá, iguais e no mesmo lugar? Mudou algo que não estava permitido?

Se algum item falhar, gere de novo (no máximo mais 2 tentativas) repetindo explicitamente as invariantes que falharam. Entregue a melhor tentativa.

## 7. Entrega
- Exatamente UMA imagem final.
- Copie o arquivo final para o diretório de trabalho como `./output.png`.
- Responda só com o caminho absoluto de `output.png`.
