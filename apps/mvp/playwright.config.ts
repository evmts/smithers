import { defineConfig } from "@playwright/test"

// Real browser against the real dev server: no route mocks.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:5190", video: "on" },
  webServer: { command: "pnpm dev", url: "http://localhost:5190", reuseExistingServer: true },
})
