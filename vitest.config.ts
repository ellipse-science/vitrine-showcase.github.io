import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests unitaires sur la logique des loaders (lib/data/*.ts).
// L'alias "@/" reproduit celui de tsconfig.json pour résoudre les imports internes.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
