---
title: Rework model endpoint security and evaluation accounting
status: done
area: model
owner: codex-mini-349375
updated: 2026-10-22
links: []
---

Rework bounced commit 69b56b184f2e on main@origin without changing app results.
Library catalog: `@smthrs/model` owns endpoints and evaluations;
`@smthrs/agent` ModelStep and `@smthrs/flow` own durable retry scheduling.
Validation compares app tests and typechecking before and after the change.

The bounced patch applied cleanly. Its HTTPS check in `Endpoint.make` also
changed `ModelProxy.prepare`, which prepares the app's durable request identity
for its in-process HTTP transport. Reproduced on the unmodified bounced patch:
`chat/Answer` returned `Exit.succeed({ status: "failed" })` instead of `"done"`;
Expire's returning-device case timed out at 30 seconds before reaching its model.

`Endpoint.make` retains public identity validation and exact proxy URL/payload
behavior. `makeSecure` validates signed provider endpoints instead: all provider
constructors, ChatGPT OAuth, the gateway evaluator, and custom route preparation
check it before signing or sending. HTTPS is required remotely; loopback HTTP
remains available. Existing preparation spans observe validation failures.

Retained the other fixes: gateway failures return once to the durable caller;
seat accounting starts fresh for every sequential or concurrent Effect execution;
backup streams preserve usage through failures and TestClock-driven deadlines;
retry markers discard abandoned text and usage; opaque safety prose keeps a 503
retryable. Tests inject faulty Effect services, with no fixed test sleeps.
The old patch's historical work-note receipts were replaced by this run's evidence.

Validation uses Node 26.5.0 after `pnpm install --frozen-lockfile --offline`:

- Baseline `main@origin`: `f62a2f975ed3adbf20b4e716e15b08f21983d4e8`.
- Whole model suite before: 1,085 passed, 9 live-provider tests skipped.
- New endpoint/accounting regression tests before production edits: 8 failed,
  20 passed (expected red proof).
- `pnpm --filter @smthrs/model test run --maxWorkers=2`: 1,110 passed,
  9 live-provider tests skipped; 100% statements, branches, functions and lines.
- `pnpm --filter @smthrs/model exec tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm --filter @smthrs/model exec dprint check`: passed.
- `pnpm exec smithers-build test '//packages/smithers/agent/model:importRules'`: passed.
- `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed.
- ESLint on all changed production modules, with `--max-warnings=0`: passed.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after, no diagnostics.
- `node --conditions=development --test apps/mvp/bench/cerebras-load/guard.test.ts`:
  4 passed before and after.
- Astra review: no concrete findings. Fable review unavailable (no executable).
- No Playwright/e2e or live provider calls; no app behavior or assertions changed.

App A/B: the exact same 372 tests ran on both revisions. Baseline: 368 passed,
4 live GitHub tests skipped. First reworked bulk run: 367 passed, 4 skipped,
one TODO steering case interrupted when its engine lease went unconfirmed for
19 seconds. All 38 agent/status/Expire cases passed in both runs (22 + 6 + 10).
The steering case passed immediately on retry. A fresh full-file TODO A/B
(`vitest run worker/flows/Todo.test.ts --coverage.enabled=false --maxWorkers=2
--reporter=json`) passed 41/41 on both revisions. The first bulk reworked run
also enabled the verbose default reporter, unlike the JSON-only baseline;
the full selection was rerun with the baseline's exact reporter settings.
The final matching bulk run passed 368 tests with the same 4 live tests skipped;
all 372 individual outcomes match the baseline exactly: **0 added failures**.
No test assertion, timeout, service or app code was weakened.

The app A/B command is `pnpm --dir apps/mvp exec vitest run <files>
--coverage.enabled=false --maxWorkers=2`. The same 17 files are run before and
after: every `*.test.ts` found with `grep -rl '@smthrs/model' apps/mvp` except
the node:test benchmark above, plus status and Expire:

- `evals/judge.test.ts`
- `worker/SignIn.test.ts`
- `worker/ModelEndpoint.test.ts`
- `worker/ModelSpend.test.ts`
- `worker/github/Triage.test.ts`
- `worker/github/Live.test.ts`
- `worker/flows/Todo.test.ts`
- `worker/flows/TodoAgent.test.ts`
- `worker/flows/Checks.test.ts`
- `src/features/agent/agent.test.ts`
- `src/features/jev/jev.test.ts`
- `src/features/timeline/store.test.ts`
- `src/features/timeline/engine.test.ts`
- `src/features/flows-ui/flows.test.ts`
- `src/features/flows-ui/failure.test.ts`
- `src/features/status/status.test.ts`
- `worker/flows/Expire.test.ts`
