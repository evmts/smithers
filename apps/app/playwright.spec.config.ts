import { defineConfig } from "@playwright/test"
export default defineConfig({
  testDir: "spec",
  testMatch: process.env.SPEC_PRODUCT_GAPS === "1" ? "**/productGaps.spec.ts" : ["**/site.spec.ts", "**/variants.spec.ts"],
  workers: 1,
  timeout: 30_000,
  outputDir: process.env.SPEC_TEST_OUTPUT ?? "test-results/spec",
  use: { headless: true },
  reporter: "list"
})
