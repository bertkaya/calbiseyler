import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], env: { DATABASE_PATH: ":memory:", SOMMELIER_DISABLE_LLM: "1" } },
});
