---
title: Flow sibling suspension and encoded codec verification
status: done
area: flow
owner: codex
updated: 2026-10-21
links: []
---

Reproduce and repair concurrent nested suspension and ResultEncoded's unchecked codec assertion. Uses the library catalog's `@smthrs/flow` durable workflow entry.

Reworked ecea1e22e6ab on e90cc1cf2f12. Suspension code and regression still apply. EngineTrace decodes persisted results through Result's JSON codec and re-encodes failure causes for existing evidence. Added malformed terminal JSON cases.

Latitude: flow vitest 921 tests / 70 files passed; gateway check passed and vitest 916 tests / 39 files passed. Both suites: 100% statements, branches, functions and lines. `pnpm exec tsc --noEmit -p apps/mvp` passed. Both requested importRules targets return unknown_label (absent on this base). Flow `pnpm run check` hits existing RetryPolicy.test.ts:657-658 number | undefined tuple errors. No fixed sleeps added. Device schema unchanged.
