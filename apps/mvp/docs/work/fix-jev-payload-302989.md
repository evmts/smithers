---
title: Jev payload validation
status: done
area: jev
owner: codex-fix-302989
updated: 2026-10-21
links: []
---
Reject whitespace-only judge input and reserve `unsure` for uncertainty at flow and action payload boundaries. Uses the existing `@smthrs/flow` declarations (library catalog: durable workflow); no new library or model path.

Validation: Latitude `pnpm exec vitest run src/features/jev` before the fix: four new regression failures and all ten existing tests passing. After: all 15 tests passing; the unscoped app-wide coverage gate fails on unrelated files. `pnpm exec vitest run src/features/jev --coverage.include=src/features/jev/*.ts` passes with 100% statements, branches, functions and lines across all four Jev modules.

Mac mini A/B: `pnpm e2e e2e/jev.spec.ts` fails with both the original schemas and the fix at “the answer settles”: expected `done`, received `failed` after 180 seconds. No new browser failure is observed; this existing end-to-end failure remains outside these schema fixes.
