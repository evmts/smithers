import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig } from "vitest/config"

// Unit tests in Node: the browser's framework-free chat layer (src/), ChatApi's handlers (worker/) and the database
// (db/), against the compose Postgres and Electric (`pnpm db:up`). React views (`*.tsx`) are end-to-end tested, so the
// coverage gate measures the logic files: every `src/**/*.ts` but the tests and their hosts.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "worker/**/*.test.ts", "db/**/*.test.ts"],
    environment: "node",
    // A finite budget that survives coverage-instrumented load, so a genuine hang still fails the run.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      enabled: true,
      provider: "v8",
      reportsDirectory: join(tmpdir(), `mvp-coverage-${process.pid}`),
      include: [
        "src/**/*.ts",
        // Remote flows (docs/features/remote-flows.md). worker/Executions.ts, the Alchemy Durable Object declaration,
        // runs only under Alchemy's bundle, so the workerd test proves it through ExecutionHost.ts instead.
        "worker/ExecutionHost.ts",
        "worker/flows/**/*.ts",
        // The metered model endpoint and admin/SetModel (docs/features/model-endpoint.md).
        "worker/Actor.ts",
        "worker/ErrorCode.ts",
        "worker/ModelEndpoint.ts",
        "worker/ModelRoles.ts",
        "worker/ModelUsage.ts",
        "worker/SetModel.ts",
        "db/migrations/0004_model_roles.ts",
        // Sign-in (docs/features/sign-in.md).
        "worker/GitHubAuth.ts",
        "worker/SessionKeys.ts",
        "worker/SessionStore.ts",
        "worker/SignIn.ts",
        "db/migrations/0005_sign_in.ts",
        // Flows, the remote door and the browser agent's answer routes (docs/features/flows.md and agent.md).
        "worker/Answers.ts",
        "worker/Body.ts",
        "worker/Flows.ts",
        "db/migrations/0006_answer_parts.ts",
        // ChatApi stops answering: the browser's agent answers (docs/features/agent.md).
        "db/migrations/0008_browser_answering.ts",
        // Repositories: RepoApi, cloning into Code Storage and its spend (docs/features/repo.md).
        "worker/RepoApi.ts",
        "worker/RepoConfig.ts",
        "worker/RepoMetrics.ts",
        "worker/RepoReads.ts",
        "worker/Repos.ts",
        "worker/RepoUpstream.ts",
        "db/migrations/0007_repositories.ts",
        // A clone attempt's own id (docs/features/repo.md#the-clone).
        "db/migrations/0009_clone_ids.ts",
      ],
      // src/flows/engine.worker.ts is a program boundary, like src/main.tsx: src/flows/engine.test.ts proves what it
      // registers, and a browser proves the rest.
      exclude: ["src/**/*.test.ts", "src/test/**", "worker/**/*.test.ts", "src/flows/engine.worker.ts"],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
})
