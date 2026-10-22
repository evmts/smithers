---
title: Harness notification evidence and cancellation receipts
status: done
area: sdk
owner: Codex
updated: 2026-10-21
links: [../../../../../packages/smithers/agent/harness/docs/concepts.md]
---

Reproduce and fix system notifications entering personal instruction evidence,
and cancellation outside a frame ending without an abort receipt.
Use the library catalog's `@smthrs/harness` cell-loop entry and existing Effect
services. Validation is limited to the harness; e2e not run (mini clone).


Implemented explicit personal-instruction evidence in notification drains and
steering events, preserving it through journal replay. System events and
coalesced outside-change facts remain transcript messages. Legacy drains remain
readable. Cancellation now has one handler around the whole loop, inside scope
cleanup so interrupted call timings exclude teardown.

Validation (Node 26.5.0; frozen offline install):

- Original sources: focused regressions fail in five cases (realm, catalog,
  relevance, suspension and system-notification evidence); both human cases pass.
  The system case observes the incorrect instruction in completion and supervision.
- Final `pnpm --filter @smthrs/harness exec vitest run --maxWorkers=2`:
  2,478 passed, 3 skipped; 100% statements, branches, functions and lines.
  An initial unrestricted-worker coverage run failed the existing ReplRealm host
  stack-overflow probe; the complete bounded-worker suite passes.
- `pnpm --filter @smthrs/harness exec tsc -p tsconfig.test.json --noEmit` passes.
- ESLint passes for all four changed source modules.
- `pnpm exec smithers-build test '//packages/smithers/agent/harness:importRules'`
  passes. Added the previously absent target and regenerated the target index.
- E2e: not run (mini clone).

Astra reviewed the change. Its timing finding was fixed and retained as a
controlled-clock regression: a 500 ms cleanup does not inflate a 20 ms model
call. The test fails at 520 ms with the handler after cleanup and passes at
20 ms with the final placement. Fable review is unavailable in this session.
