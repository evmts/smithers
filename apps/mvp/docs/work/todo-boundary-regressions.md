---
title: TODO boundary regressions
status: done
area: todos
owner: codex
updated: 2026-10-21
links: []
---

Reproduce the seven reported TODO contract, flow, store and view failures in an isolated workspace. Use the catalog's durable retry policy, Electric sync and TanStack DB Effect services. Validate on Latitude; no push or bookmark changes.

All seven findings reproduced on Latitude before their fixes: oversized escaped JSON (413), Unicode title rejection and split surrogate, retry instead of terminal refusal, cross-repository delivery, missing badge label, prompt-shape access left allowed, and persistence recovery blocked by a cached defect.

Latitude validation: `pnpm exec vitest run src/features/todos worker/stack --coverage.enabled=false --silent` passed 145 tests. `pnpm typecheck` passed; the final fixture's three store regressions passed separately. `pnpm test --silent --maxWorkers=2` completed: 2,547 passed, six failed, nine skipped, plus one Vitest worker teardown error. The package suite is not green. The boot layer-count assertion, three window-fixture failures and chat shortcut cleanup failure reproduce with the parent production sources. The clone-retry test failed with 503 in the full run and passed in isolated runs on both parent and fixed sources. These unrelated failures were not changed.
