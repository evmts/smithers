import { defineConfig } from "vitest/config"

/**
 * The real-browser suites: Playwright's Chromium over real OPFS, Web Locks
 * and BroadcastChannel. They run bundles in the browser, so they add nothing
 * to the coverage the Node suites measure.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/browser/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000
  }
})
