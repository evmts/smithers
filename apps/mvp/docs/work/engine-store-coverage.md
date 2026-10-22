---
title: Complete engine-store behavioral coverage
status: done
area: sdk
owner: Codex engine-store-coverage
updated: 2026-10-21
links: [../../../../packages/smithers/flows/engine-store/README.md]
---

Measure uncovered engine state, driver, listing and test-store behavior on real
SQLite and PostgreSQL through the package matrix. Add behavioral assertions or
remove proven dead code; retain every 100% coverage threshold.

Library catalog entry: `@smthrs/engine-store` (durable engine composition).

Baseline: `pnpm coverage` at `81a8e357`, Node 26.5.0. SQLite measured:

| File | Uncovered statement lines | Uncovered branch lines |
| --- | --- | --- |
| `DurableEngineState.ts` | None | 1715, 1732, 1765, 1809 (Postgres dialect) |
| `internal/RunDriver.ts` | 2019 | 2766 |
| `internal/RunListing.ts` | None | 169 (Postgres dialect) |
| `test/TestStores.ts` | 112, 114 | 105, 111 (Postgres setup) |

Added `RunDriverLivenessFaults.test.ts`: a typed cancellation-read outage must
leave the run running, then a remote durable request must cancel it and persist
its owner's acknowledgement. An interrupting heartbeat callback must leave no
failure metric or warning, release the receipt permit, renew ownership, allow
the next pulse and stop when the run completes. Both use the production SQL
stores selected by the package's SQLite/Postgres matrix; only the failed read
is injected through the RunStore service. No production behavior or public API
changed, so no API documentation regeneration or changeset is required.

The complete baseline matrix covers the Postgres-only paths above. Its only
remaining coverage gap is RunDriver's interruption branch at 2766 (the text
report anchors it at 2765).

The second complete `pnpm coverage` matrix measured 100% of every source file:

| File | Lines | Branches | Functions | Statements |
| --- | --- | --- | --- | --- |
| `DurableEngineState.ts` | 633/633 | 361/361 | 300/300 | 689/689 |
| `internal/EngineStateSchema.ts` | 4/4 | 2/2 | 2/2 | 4/4 |
| `internal/RunDriver.ts` | 891/891 | 657/657 | 275/275 | 996/996 |
| `internal/RunListing.ts` | 50/50 | 47/47 | 9/9 | 53/53 |
| `test/TestStores.ts` | 15/15 | 12/12 | 6/6 | 15/15 |
| All 85 source files | 6594/6594 | 4001/4001 | 2064/2064 | 7331/7331 |

Thresholds, source inclusion and production code are unchanged. Local receipts:
`/tmp/smithers-engine-store-final.log` and
`/tmp/smithers-engine-store-final-coverage.json`.

The baseline's first SQLite leg ran before the missing native helper was built
and failed 59 tests. The helper now builds in this clone with
`cargo build --locked -p smithers-ffi --bin smithers-jj-export -j 4`.

The existing heartbeat cancellation test failed on Postgres because its receipt
finalizer finishes before the terminal SQL transaction commits. It now waits
for the persisted cancellation before its unchanged assertions.

Full second matrix: SQLite 2174/2174 passed; Postgres 2168/2174 passed. The
Postgres failures were three queue recovery cases, one boundary-log assertion,
one interrupted PlanScheduler case, and the new heartbeat test capturing an
unannotated TestClock diagnostic. The last was corrected by collecting this
run's annotated warnings while preserving all metric and lifecycle assertions.
After that test-only correction, the focused matrix passes all six liveness
tests on each database (12/12). Its partial coverage correctly fails the global
100% gate. The complete matrix was not repeated after the logger correction;
the measured production source is identical. Focused receipt:
`/tmp/smithers-engine-store-liveness-final.log`.

Two other baseline Postgres failures reproduced in a focused matrix:
`DurableQueueCrash.test.ts` exhausts its recovery polling bound, and
`EffectBoundaryRecords.test.ts` captures an additional warning. Their code and
assertions remain unchanged.

`pnpm check` passes. `pnpm lint` passes ESLint, then fails on existing dprint
differences in `docs/api.md` and `test/RunUsageMetrics.test.ts`; neither changed
in this workstream. Changed-file formatting passes.

Astra reviewed the new tests, cancellation wait and logger correction with no
findings. Fable review could not launch: configured accounts unavailable.
