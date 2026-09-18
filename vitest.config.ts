import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./vendor/md_design/lib", import.meta.url)) } },
  test: { include: ["tests/*.test.ts", "preview.test.ts"], environment: "jsdom" },
})
