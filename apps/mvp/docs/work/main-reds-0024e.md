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
