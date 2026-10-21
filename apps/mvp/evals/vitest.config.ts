import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// `pnpm eval`: the agent evals (docs/features/agent-evals.md). They call the real model through ChatApi's metered
// endpoint and spend tokens, so `pnpm test` never runs them.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["evals/*.eval.ts"],
    environment: "node",
    // A whole suite runs inside one test: about 20 agent answers in turn, each a few model calls.
    testTimeout: 30 * 60_000,
    hookTimeout: 120_000,
  },
})
