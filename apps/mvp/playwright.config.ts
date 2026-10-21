import { defineConfig } from "@playwright/test"

// Real browsers against the real app, Worker, Durable Object and model: no mocks.
// BASE_URL points the tests at a deployment; without it, Playwright starts `alchemy dev`
// (which needs the chat model's credential, CEREBRAS_API_KEY by default, in the environment).
const baseURL = process.env.BASE_URL ?? "http://localhost:1337"

// Every test records its page at the size it renders, so `pnpm e2e:gifs` scales one sharp picture down instead of
// blowing up Playwright's default 800×450 recording.
const viewport = { width: 1280, height: 720 }

export default defineConfig({
  testDir: "e2e",
  // Only specs: e2e/*.test.ts are the media scripts' unit tests, which vitest runs.
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  use: { baseURL, viewport, video: { mode: "on", size: viewport }, trace: "retain-on-failure" },
  webServer: process.env.BASE_URL ? undefined : { command: "pnpm dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})
