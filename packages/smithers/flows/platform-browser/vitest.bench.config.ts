import vibelang from "vibelang-vite"
import { defineConfig } from "vitest/config"

/**
 * The benchmarks: timed runs of the engine over the Node suites' stores. They
 * print what they measure, assert nothing, and add nothing to coverage.
 */
export default defineConfig({
  plugins: [vibelang({ project: "tsconfig.test.json" })],
  test: {
    environment: "node",
    include: ["test/**/*.bench.{ts,vibe}"],
    testTimeout: 300_000
  }
})
