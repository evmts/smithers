---
title: Close main coverage gaps
status: done
area: app-tests
owner: codex-mvp-coverage
updated: 2026-10-23
links: [../rules.md]
---

Restore the unchanged 100% app coverage gate after the newer feature stacks. All validation runs on Latitude. No push or local dependency installation.

Baseline `f33937fbbcdb`: 290 files passed, 3,748 tests passed, 2 expected failures and 16 skipped tests. Statements 99.93%, branches 99.8%, functions 99.92%, lines 99.98%; gate exit 1.

Behavioral regressions cover pre-start webhook delivery, failed base discovery and recovery, reporting against a closed base, empty/open descendant discovery, cleanup launch failure, default HTTP metadata authorization, explicit file-tab pathname, persisted conversation identities and pending acts ahead of the device clock.

Stack reports now use the base from the current TODO already read under the stack lock. The removed optional lookup joined the same TODO and attempt to an immutable prompt revision: `apply` writes that revision before admitting an attempt, `report` admits later attempts against that revision, and neither deletes revisions. The `holds` check already proves the current TODO and attempt exist. The missing-row fallback had no caller-reachable state; the redundant query is gone.

Catalog entries used: `@smthrs/flow` for durable execution and recovery, `@smthrs/integrations` for GitHub calls, and `@smthrs/effect-tanstack-db` for device persistence. No new library, mock, exclusion, skip or threshold change.

Final Latitude validation on the unchanged gate:

- `pnpm test --maxWorkers=2`: exit 0; 290 files passed, 3,766 tests passed, 2 existing expected failures and 16 existing skipped tests.
- Statements 21,494/21,494, branches 11,486/11,486, functions 6,494/6,494 and lines 18,621/18,621: all 100%.
- `pnpm typecheck`: exit 0 across browser, worker, infrastructure and eval projects.
- `pnpm exec smthrs test '//apps/mvp:importRules'`: exit 0.

The final set also covers restored attempts predating pinned bases, a base dropped between branch creation and reporting, upstream base changes before projection, restored waits on unpublished bases, terminal/replaced invalidation snapshots, missing/interrupted cancellation and admission of a queued Retry when cleanup frees a lane. File-tab rows restore by their declared identity. All 217 focused tests passed; focused coverage proved every coordinate remaining in the preceding full report before the final full run. The partial run retained the whole-app thresholds and therefore was not a green gate receipt.
