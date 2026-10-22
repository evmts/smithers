---
title: Model proxy wire boundaries
status: done
area: sdk
owner: Codex mini/fix-packages-smithers-agent-model-src-471679
updated: 2026-10-21
links: [../../../../packages/smithers/agent/model/docs/guides/proxy-a-model.md]
---

Reproduce and fix invalid retry delays, endpoint credentials in prepared requests,
and unbounded partial response lines. Uses the library catalog's `@smthrs/model`
entry and existing Effect HTTP transport and Schema boundaries. No new library.

Regression proof: `pnpm --filter @smthrs/model exec vitest run
test/ModelProxy.test.ts --coverage.enabled=false --maxWorkers=2` failed 12
assertions before the production change; 80 passed. After the fix, all 92 passed;
the expanded proxy suite now passes 95 tests.
The final package suite (`pnpm --filter @smthrs/model exec vitest run
--maxWorkers=2`) passes 1,057 tests, skips 9 opt-in live cases, and earns 100%
statement, branch, function and line coverage. Package TypeScript checks and
ESLint/dprint checks of the changed files pass. E2E: not run (mini clone).

Prepared endpoint validation reuses `Endpoint.make`, retaining relative URL
identity while refusing credentials. Response lines are capped at 1 MiB of UTF-8
bytes before decoding; oversized bodies are cancelled and failures pass through
the existing structured request observations. Retry delays are finite and
nonnegative, with zero and fractional delays preserved.

Astra review identified a chunk-dependent rejection of oversized data after a
terminal line. A regression failed for combined chunks and passed for separate
chunks; incremental line delivery fixes it, and Astra re-review has no findings.
Fable review is unavailable through this session's tools/models.
