import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig } from "vitest/config"

// Unit tests in Node: the browser's framework-free chat layer (src/), ChatApi's handlers (worker/) and the database
// (db/), against the compose Postgres and Electric (`pnpm db:up`). React views (`*.tsx`) are end-to-end tested, so the
// coverage gate measures the logic files: every `src/**/*.ts` but the tests and their hosts.
export default defineConfig({
  test: {
    include: [
      "PACKAGE.test.ts",
      "src/**/*.test.ts",
      "worker/**/*.test.ts",
      "db/**/*.test.ts",
      "infra/**/*.test.ts",
      "evals/**/*.test.ts",
      // The e2e media scripts' pure parts (e2e/frames.ts); Playwright runs only e2e/*.spec.ts.
      "e2e/**/*.test.ts",
      // The dev server's HTTPS and HTTP/2 front (dev/https.ts).
      "dev/**/*.test.ts",
      // Dashboards as code (ops/grafana/README.md) against the telemetry contract.
      "ops/**/*.test.ts",
    ],
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
        "worker/RunCredentials.ts",
        "worker/SignIn.ts",
        "db/migrations/0005_sign_in.ts",
        // Remote flow starts and the browser agent's answer routes (docs/features/remote-flows.md and agent.md).
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
        // What GitHub says of a repository, the clone in its asker's feed, and the reclaim mark (docs/features/repo.md).
        "worker/RepoAbout.ts",
        "worker/CloneFeed.ts",
        "db/migrations/0028_clone_progress.ts",
        // Who asked each question, which the answer routes require (docs/features/agent.md#the-answer-routes).
        "worker/Messages.ts",
        "db/migrations/0011_question_askers.ts",
        // The edge throttle on the open routes (docs/features/chat.md#throttling).
        "worker/Throttle.ts",
        // The conversation's views and web pages (docs/features/web-pages.md).
        "worker/Views.ts",
        "worker/WebPreview.ts",
        "db/migrations/0010_views.ts",
        // Budget reservations (docs/features/model-endpoint.md#budget).
        "db/migrations/0012_model_reservations.ts",
        // A person's own flows (docs/features/flows.md#your-own-flows).
        "worker/PersonalFlows.ts",
        "db/migrations/0015_flows.ts",
        // Every stored prompt flow converted to flow source (docs/features/flows.md#your-own-flows).
        "db/migrations/0025_flow_source.ts",
        // Unknown model spend keeps its reservation; reservations expire (docs/features/model-endpoint.md#budget).
        "db/migrations/0017_model_charges.ts",
        // Model spend and its alerts to Admins (docs/features/spend-alerts.md).
        "worker/ModelSpend.ts",
        "worker/SpendAlerts.ts",
        "db/migrations/0019_spend_alerts.ts",
        // Where spend alerts go outside the app, and their receipts (docs/features/spend-alerts.md#channels).
        "worker/AlertChannels.ts",
        "db/migrations/0029_alert_channels.ts",
        // Agent status: the runs routes and table (docs/features/agent-status.md).
        "worker/Runs.ts",
        "db/migrations/0013_runs.ts",
        // Notifications: the feed's fold, routes and shape, and the run index's scope (docs/features/notifications.md).
        "worker/Notifications.ts",
        "db/migrations/0020_notifications.ts",
        // The git loop: GitHub's webhook, the writes route, the issues' shapes and the GitHub flows
        // (docs/features/issues.md). The scripted GitHub and the fixtures are test support.
        "worker/github/*.ts",
        "db/migrations/0016_github_issues.ts",
        // Issue triage: its settings, decisions and pins (docs/features/issues.md#triage).
        "db/migrations/0018_triage.ts",
        // Repository secrets: the write routes, the flows, the shape and the sandbox egress (docs/features/secrets.md).
        "worker/secrets/*.ts",
        "db/migrations/0021_secrets.ts",
        // TODOs and the stack: its one writer, its route and shapes (docs/features/todos.md).
        "worker/stack/*.ts",
        "db/migrations/0022_todos.ts",
        "db/migrations/0035_todo_report_receipts.ts",
        // A TODO's run, watched from the browser (ruling TODO-3, docs/features/runs.md#a-run-on-cloudflare).
        "worker/RemoteRuns.ts",
        "db/migrations/0036_todo_run.ts",
        // The branch workspace: branches, their conversations and terminals (docs/features/branch-workspace.md).
        // worker/BranchSandboxes.ts and worker/BranchRooms.ts, the Cloudflare Durable Objects, run only under Alchemy's
        // bundle; e2e/branch-workspace.spec.ts and e2e/branch-sharing.spec.ts drive them, and
        // @smthrs/platform-cloudflare's workerd and @smthrs/sync's presence tests test their parts.
        "worker/branch/*.ts",
        "db/migrations/0014_branch_workspace.ts",
        "db/migrations/0023_branch_sharing.ts",
        // The sandbox tools: their calls on a branch's machine (docs/features/sandbox-tools.md).
        "db/migrations/0024_sandbox_calls.ts",
        // Co-editing: the texts people edit together (docs/features/coedit.md).
        "db/migrations/0026_text_updates.ts",
        // What the Electric gateway lets through (docs/infrastructure.md).
        "infra/ElectricAccess.ts",
        // A shape request the server can't decide is refused, never narrowed (docs/features/chat.md).
        "worker/ShapeAccess.ts",
        // The agent evals' cases, checks, judge and report (docs/features/agent-evals.md). evals/session.ts and
        // evals/agent.eval.ts are the program, which `pnpm eval` runs against the real model.
        "evals/cases.ts",
        "evals/checks.ts",
        "evals/judge.ts",
        "evals/report.ts",
        // How a flow's video and GIF are paced, captioned and checked (e2e/gifs.mjs, e2e/check-gifs.mjs).
        "e2e/frames.ts",
        // The e2e run against a deployment: its summary, spend guard and stored session (docs/infrastructure.md#against-a-deployment).
        "e2e/summary.ts",
        "e2e/spend.ts",
        "e2e/deployment/session.ts",
        // The dev server over HTTPS and HTTP/2, as production serves the app (docs/infrastructure.md#https-and-http2).
        "dev/https.ts",
      ],
      // src/flows/engine.worker.ts is a program boundary, like src/main.tsx: src/flows/engine.test.ts proves what it
      // registers, and a browser proves the rest.
      // src/features/code-intel/language.worker.ts is one too: src/test/languageServer.ts runs the same server in Node.
      exclude: [
        "src/**/*.test.ts",
        "src/test/**",
        "worker/**/*.test.ts",
        "src/flows/engine.worker.ts",
        "src/features/code-intel/language.worker.ts",
      ],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
})
