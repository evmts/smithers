---
title: Keep repository selection when a branch action completes
status: done
area: home
owner: codex
updated: 2026-10-21
links: []
---

Rework of 71c9f6ae2f37 on the isolated home-action path. Preserve repository and token early returns; navigation resets running state, so stale completion must not clear another action. Uses the catalog's existing @smthrs/flow dispatch and @smthrs/effect-tanstack-db collections.

Validation on Latitude: `pnpm test src/features/home`: 52 tests passed; exit 1 only on app-wide 100% coverage thresholds (scoped execution). `pnpm exec smithers-build test '//apps/mvp:importRules'`: passed. Removing the finish guard temporarily and running `pnpm test src/features/home/live.test.ts -t 'a completed branch action'` failed at the expected assertion: completion returned the old repository's branch URL. The guard was restored unchanged. No fixed sleeps added.
