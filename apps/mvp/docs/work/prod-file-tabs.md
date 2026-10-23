---
title: Closed file tabs stay closed after reload
status: done
area: files
owner: Codex
updated: 2026-10-23
links: [../features/files.md, ../decisions/0002-local-first.md]
---

The repeated production failure on 9f03901b23e2 exposed a completion race:
`drop` returned after optimistic deletion, before its device transaction persisted.
The evidence records navigation at 02:08:23.953, the close step at 02:08:24.028,
the close run settled at 02:08:24.109, and the reload's engine at 02:08:24.343.
The logs carry no device commit receipt, so the stalled real-SQLite regression
establishes the missing ordering guarantee directly: two stored tabs still exist
when the old close action navigates. With the fix, navigation waits for the receipt
and reopening the store restores only index.html, at its original position and lines.

The library-catalog entry is `@smthrs/effect-tanstack-db`; no new library, storage
schema, public API, UI copy, retry loop or feature integration was added. Keep/drop
hold their semaphore through persistence; a transient coordinator refusal is handled
per route-follower event, while explicit actions cannot report successful writes.
SQL durability failures remain terminal under TanStack's existing contract.

Proof: `pnpm --dir apps/mvp exec vitest run src/features/files/persistence.test.ts
src/features/files/files.test.ts --coverage.include=src/features/files/store.ts
--coverage.include=src/features/files/actions.ts`: 21 passed, 100% statements,
branches, functions and lines in both changed modules. The persistence regression
failed on the original code; the coordinator regression failed without per-event
handling. `pnpm --dir apps/mvp exec tsc -p tsconfig.json --pretty false` passed.
Codex Astra reviewed the change; its recovery finding was fixed and re-reviewed.

Local `playwright test e2e/files.spec.ts --grep 'keyboard:' --workers=1` could not
start: Alchemy requires the absent `CEREBRAS_API_KEY`. No production e2e or deployment
ran. No public API change requires docs generation or a changeset. Fable review
was unavailable in this session. Local delivery bookmark: mini/prod-file-tabs.
