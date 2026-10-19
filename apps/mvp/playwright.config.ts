import { defineConfig } from "@playwright/test"

// Real browsers against the real app, Worker, Durable Object and model: no mocks.
// BASE_URL points the tests at a deployment; without it, Playwright starts `alchemy dev`
// (which needs the chat model's credential, CEREBRAS_API_KEY by default, in the environment).
const baseURL = process.env.BASE_URL ?? "http://localhost:1337"

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: { baseURL, video: "on", trace: "retain-on-failure" },
  webServer: process.env.BASE_URL ? undefined : { command: "pnpm dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})
