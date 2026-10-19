import { defineConfig } from "@playwright/test"

// Real browser against the real app: no route mocks. BASE_URL points it at production;
// without it, Playwright starts the local app and Worker.
const baseURL = process.env.BASE_URL ?? "http://localhost:5190"

export default defineConfig({
  testDir: "e2e",
  use: { baseURL, video: "on" },
  webServer: process.env.BASE_URL
    ? undefined
    : [
        { command: "pnpm dev:worker", url: "http://localhost:8790/", reuseExistingServer: true },
        { command: "pnpm dev", url: "http://localhost:5190", reuseExistingServer: true },
      ],
})
