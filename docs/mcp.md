# Preparado para MCP

O Studio ainda não tem servidor MCP, mas toda operação já está descrita como uma **ação** em `lib/actions/`,
no formato de uma ferramenta MCP: nome estável, descrição para o modelo, schema de entrada (zod → JSON Schema)
e a função que executa.

```
lib/actions/define.ts      defineAction, runAction (valida → 400), describeAction (entrada de tools/list)
lib/actions/products.ts    list_products, get_product, get_next_step, create_product, update_product,
                           move_product, add_images (base64), delete_image
lib/actions/generation.ts  get_catalog, generate_images, get_job, cancel_job, retry_job,
                           review_image, reframe_image, export_images
lib/actions/lab.ts         list_lab_tools, render_lab_model (gera o 3MF de uma ferramenta do Lab),
                           list/get/save/rename/duplicate/delete_lab_creation (histórico "Minhas criações"),
                           send_lab_creation_to_studio (criação → imagens do 3D renderizadas no servidor → produto)
lib/actions/index.ts       ACTIONS (registro), listActions(), callAction(nome, input)
```

Quem usa hoje:
- As rotas em `app/api/**` (adaptadores finos para a interface).
- `GET /api/actions` — lista as ações com JSON Schema (igual a um `tools/list`).
- `POST /api/actions/<nome>` com o input em JSON (igual a um `tools/call`). Ex.:
  `curl -XPOST localhost:3456/api/actions/get_next_step -d '{"slug":"cavalo-carrossel"}'`

## Implementar o servidor MCP depois

Com `@modelcontextprotocol/sdk`, o servidor é só um laço sobre o registro:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ACTIONS, runAction } from "@/lib/actions";

const server = new McpServer({ name: "marketplace-studio", version: "0.1.0" });
for (const action of Object.values(ACTIONS))
  server.registerTool(
    action.name,
    { title: action.title, description: action.description, inputSchema: action.input.shape, annotations: { readOnlyHint: action.readOnly } },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await runAction(action, input)) }] }),
  );
```

Transporte: `stdio` para uso local (Claude Desktop/Code, Codex) ou Streamable HTTP numa rota `app/api/mcp` para
clientes remotos. Para vender o Studio a outros usuários ainda falta: autenticação e isolamento por conta
(hoje `products/` é uma pasta local), limites de uso, e devolver imagens como conteúdo `image` nas ferramentas
que retornam arquivos.
