import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  // Lab models (.scad) are imported as plain text, like in next.config.ts.
  plugins: [{ name: "scad-as-text", transform: (code, id) => (id.endsWith(".scad") ? `export default ${JSON.stringify(code)};` : undefined) }],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
