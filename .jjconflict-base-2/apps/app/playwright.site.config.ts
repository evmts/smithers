import { defineConfig,devices } from "@playwright/test"

const sitePort = process.env.SMITHERS_SITE_E2E_PORT ?? "47312"
const siteOrigin = "http://127.0.0.1:" + sitePort

// Exercise the built Astro landing and its real AppIsland chunk, not the SPA entry.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: { baseURL: siteOrigin, headless: true, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", testMatch: "**/site/*.spec.ts", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm --filter @smithers/site run build && pnpm --filter @smithers/site run preview --host 127.0.0.1 --port ${sitePort}`,
    url: siteOrigin,
    reuseExistingServer: false,
    // The full Astro build with Pagefind measured 5.5 minutes on a loaded workstation; 240 s timed out.
    timeout: 600_000,
    // Astro otherwise detaches automatically in an agent environment.
    env: { ASTRO_PREVIEW_BACKGROUND: "1" },
  },
})
