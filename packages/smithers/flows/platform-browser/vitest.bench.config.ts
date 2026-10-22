import { defineConfig } from "vitest/config"

/**
 * The benchmarks: timed runs of the engine over the Node suites' stores. They
 * print what they measure, assert nothing, and add nothing to coverage.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.bench.ts"],
    testTimeout: 300_000
  }
})
