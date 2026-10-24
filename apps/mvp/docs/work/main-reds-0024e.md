---
title: Flow editor landing gate regressions
status: in-progress
area: flows-ui
owner: Codex GPT-6.1 Sol
updated: 2026-10-24
links: []
---

Fix the empty answer cleanup and cover flow editor restoration, tab identity, and device registration. Library catalog entry: app state through `@smthrs/effect-tanstack-db`; keep its mutation contract and skip empty deletes at the caller. Validate focused coverage, the full apps/mvp suite under the shared lock, typecheck, and importRules. Leave TODO, issues, pulls/store and repo/actions work to its owner.

Tab identity is wired into `main.tsx` startup, not a device collection. Its tests use real session storage and Web Locks, including reload, duplicate tabs, back/forward cache and unavailable host APIs. The empty unavailable-answer collection cannot receive writes: `setAnswer` and `answer` return while `editorAvailable` is false. Its duplicate, unreachable key callback now shares the persisted answer collection's tested key function. Persisted registry tests restore and replace all three editor row types by their declared identities.

Navigation races delay real collection operations and dispatch results through injected Effect services. They preserve the next editor's unsaved text, including same-name reads, stash replacement and consumption, and late save refusals. Restore-failure cases retain exact form, answer and code rows, refuse further edits, and recover all three on reload. Astra review cleared the changes after these assertions were strengthened. Fable review could not launch: the eligible Claude account could not authenticate; the other accounts are reserved.

The answer-store fallback now logs and creates its empty collection behind one conditional Effect, removing the redundant failure guard. Real recovery tests exercise both outcomes; Astra reviewed this final refactor without findings. No coverage thresholds, exclusions or ignore directives changed.

Validation: `pnpm test --maxWorkers=2 src/features/flows-ui src/device` with coverage limited to `flows-ui/actions.ts`, `flows-ui/store.ts`, `device/editorTab.ts` and `device/registry.ts` passed all 186 tests in 18 files, with no unhandled errors and 100% statements (487), branches (246), functions (169) and lines (371). Receipt: `/tmp/main-reds-0024e-complete-focused.log`. Browser, infra and eval typechecks pass; worker typecheck reports only the 35 known TS2741 `preconnect` errors. `pnpm exec smithers-build test '//apps/mvp:importRules'` passes. The full-suite command is waiting for the shared lock; its receipt will be `/tmp/main-reds-0024e-resumed-full.log`.
