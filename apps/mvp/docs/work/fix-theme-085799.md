---
title: Restore system theme and tab failure reasons
status: done
area: theme
owner: codex-theme-085799
updated: 2026-10-21
links: []
---
Uses the catalog entries @smthrs/effect-tanstack-db for device state and @smthrs/flow for the existing theme action.

Latitude baseline: 9 tests passed. Regression assertions against unchanged production code: 4 failures (deletion and timeout/unknown_method/refused).

The fix clears both browser overrides and retains the typed tab cause in durable error receipts. The optional cause keeps historical errors readable. Existing flow dispatch logs, spans and counters remain the observability boundary.

Validation: Latitude `pnpm test src/features/theme src/flows/dispatch.test.ts src/flows/engine.test.ts --coverage.enabled=false` passed 33 tests; final theme-only run passed 11 tests. `pnpm exec smithers-build test //apps/mvp:importRules` passed.

Mac mini `pnpm e2e agent.spec.ts --grep "theme by button"` was requested but canceled after more than 15 minutes waiting for another live run’s shared e2e lock. Browser verification remains blocked by runner capacity.
