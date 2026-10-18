import { defineConfig } from "@playwright/test"
export default defineConfig({
  testDir: "e2e/gateway", workers: 1, retries: 0, timeout: 120_000,
  expect: { timeout: 30_000 }, reporter: "list", use: { headless: true, actionTimeout: 15_000 }
})
