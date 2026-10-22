---
title: Issues view unknown counts and metadata link identity
status: done
area: ui
owner: codex
updated: 2026-10-21
links: []
---
Fix unfiltered unknown counts and duplicate metadata link keys in the library catalog's @smthrs/ui IssuesView entry. Regression tests exercise the real React renderer and DOM.

Confirmed both regressions on the baseline (16 pass, 2 fail). After the fix, all 2,577 UI tests pass, as do UI and app typechecks and the UI importRules target. Metadata link keys use the destination and label, retaining identity when same-label links reorder. Unknown lists suppress unfiltered counts until known. No persisted schema changes.

Mac mini end-to-end command `pnpm e2e issues.spec.ts` was requested through mini-run, but remained queued for eight minutes with no slot or test output; canceled before execution. End-to-end validation remains blocked on farm capacity.
