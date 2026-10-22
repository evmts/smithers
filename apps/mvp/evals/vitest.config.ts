import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// `pnpm eval`: the agent evals (docs/features/agent-evals.md). They call the real model through ChatApi's metered
// endpoint and spend tokens, so `pnpm test` never runs them.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["evals/*.eval.ts"],
    environment: "node",
    // A whole suite runs inside one test: up to 36 agent answers in turn, each a few model calls, and a pause of a
    // minute before each trial its model failed (evals/suite.ts).
    testTimeout: 120 * 60_000,
    hookTimeout: 120_000,
  },
})
