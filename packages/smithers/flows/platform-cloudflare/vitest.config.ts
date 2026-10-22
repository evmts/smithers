import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globalSetup: [fileURLToPath(new URL("../../../repo-targets/test-utils/coverage-teardown.mjs", import.meta.url)), fileURLToPath(new URL("../../../repo-targets/test-utils/test-process-environment.mjs", import.meta.url))],
    environment: "node",
    // The execution suites build the durable engine over the compose Postgres
    // and drive real flows through it, migrations included, so one case is
    // several seconds of real I/O. The crash case also starts a Node child.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      enabled: true,
      provider: "v8",
      reportsDirectory: join(tmpdir(), `flows-platform-cloudflare-coverage-${process.pid}`),
      include: ["src/**/*.ts"],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 }
    }
  }
})
