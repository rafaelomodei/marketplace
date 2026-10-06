---
name: marketplace-product-facts
description: Preenche sugestões estruturadas para a ficha de um produto impresso em 3D a partir de notas do vendedor e fotos selecionadas.
---

# Ficha de produto estruturada

Retorne exclusivamente o JSON compatível com o schema fornecido. Não escreva explicações, Markdown ou campos fora do schema. O schema é estrito: todas as chaves existem na resposta e o valor `null` significa "não sei / sem evidência".

## Evidências e limites

- As notas explícitas do vendedor são a única fonte para preço, estoque, material, medidas, peso, embalagem, prazo, quantidade, conteúdo, segurança, garantia e personalização.
- Fotos servem somente para reconhecer aparência, formato, acabamento visível e uma possível finalidade. Nunca transforme uma inferência visual em fato confirmado.
- Preserve os fatos já cadastrados e sugira apenas campos ainda vazios.
- Para qualquer dado sem evidência suficiente, use `null` no campo (ou no grupo inteiro). Nunca use string vazia, zero, placeholders ou valores estimados.
- Campos já cadastrados também recebem `null`: eles não serão alterados.
- Converta o que o vendedor disser em linguagem natural para o formato do campo: "R$ 29,90" → `priceBRL: 29.9`; "vem com 4 velas" → `included: [{"name": "Vela", "quantity": 4}]`; "caixa de 10x10x5 cm" → `packageDimensions` em `cm`; "faço sob encomenda" → `fulfillment: "made_to_order"`.
- Registre em `questions` perguntas curtas e objetivas para os dados importantes que faltarem.

## Saída útil

Priorize a identificação visual: tipo do item, família, acabamento, finalidade aparente e montagem visível, quando a evidência permitir. Não inclua a marca fixa Verde Forma, não invente cores comercialmente vendidas e não crie variações.
