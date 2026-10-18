import { defineConfig } from "@playwright/test"
export default defineConfig({
  testDir: "spec",
  testMatch: "**/realJudges.spec.ts",
  workers: 1,
  timeout: 30_000,
  outputDir: process.env.SPEC_TEST_OUTPUT ?? "test-results/judges",
  use: { headless: true },
  reporter: "list"
})
