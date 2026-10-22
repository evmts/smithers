---
title: Agent child lifecycle, cache authority, and flow publication bugs
status: done
area: sdk
owner: Codex fix-amend-8ae54d8b-320294
updated: 2026-10-22
links: [../../../../packages/smithers/agent/README.md]
---

All nine supplied findings reproduced before their fixes:

| Finding | Failing behavior |
| --- | --- |
| Explicit null payload | Empty-struct worker started instead of rejecting null |
| Startup budget | Slow and stalled row reads outlived the deadline |
| Detached logs | Captured diagnostic contained the injected password |
| Runtime polling | `FlowExecutionNotFound` escaped `Effect.catch` as a defect |
| Await suspension | Parent polled again without scheduling a durable timer |
| Sandbox memo | Different authority and unknown runs reused the earlier output |
| Inherited cache environment | Omitted authority executed only once across two runs |
| Parent replacement | Publication overwrote the outside file |
| Cleanup failure | Published bytes existed but the receipt was `write_failed` |

Use the catalog's `@smthrs/agent` runtime, `@smthrs/flow` durable timers,
and `@smthrs/kernel` filesystem confinement. A plain path-only filesystem
cannot close the publication race: refuse it, and use the existing pinned
no-follow view for staging, backup, publication, rollback and cleanup.
Unknown authority with no running flow disables sandbox memoization.
A journaled await deadline prevents a resumed round from resetting its budget.

Validation: all 225 tests in EngineChildren, FlowEngineLike,
FlowEngineLikeFailures, CellSandbox and FlowStore pass. The extra cleanup
observability assertion also passes. TypeScript, formatting and the new package
importRules target pass. The native helper was built locally with
`cargo build --locked --release -p smithers-ffi --bin smithers-jj-export`.

The broad baseline exposed existing failures in ModelStep's Retry-After case,
AgentSession's timeout cases, the tweet-thread example and the tagged-error
audit; it was stopped after a remaining worker failed to finish. The full
configured-coverage rerun reproduced the same ModelStep Retry-After failure
and was stopped; full-suite and aggregate-coverage validation are incomplete.
The affected 225-test suite, the final 48-test child suite, and the cleanup
observability assertion pass. No coverage thresholds were changed.
E2e: not run (mini clone).

One local jj commit and bookmark only; no push, main movement or deployment.

Amendment of 8ae54d8b040d (2026-10-22): a clean Latitude checkout reproduced
18 failures out of 62 FlowStore tests. The atomic host added above requires
`smithers-jj-export`; the original validation built it manually, leaving the
package test command unable to reproduce that validation. Vitest global setup
now builds the real helper with Cargo in the checkout's target directory,
refreshing a release build when present and otherwise building debug. No
filesystem fallback, skipped test, or weakened confinement was introduced.
The catalog entry remains `@smthrs/kernel` filesystem confinement, hosted by
`@smthrs/platform-node`.

Latitude affected validation: `pnpm test test/FlowStore.test.ts
test/EngineChildren.test.ts test/FlowEngineLike.test.ts
test/FlowEngineLikeFailures.test.ts test/CellSandbox.test.ts
--coverage.enabled=false`: 225 passed across five files.
`pnpm exec smithers-build test '//apps/mvp:importRules'`: passed, zero violations.

Latitude whole-package validation: `pnpm exec vitest run` completed in 601 s:
158 files passed, two skipped, one failed; 2,130 tests passed, three skipped,
one failed. All 62 FlowStore tests and all 39 ModelStep tests passed.
The remaining failure is the pre-existing Fault.sweep registration audit:
`flows/flow/src/Action/once.ts: @smthrs/flow/EffectKeyUnavailable` is unregistered.
The initial, unamended whole-package run also reproduced that audit failure;
it was stopped after reproducing the missing-helper failures. No coverage
threshold was changed, and aggregate coverage is not a passing receipt.
