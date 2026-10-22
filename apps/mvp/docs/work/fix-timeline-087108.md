---
title: Timeline summary regressions
status: done
area: timeline
owner: codex-fix-timeline-087108
updated: 2026-10-21
links: []
---

Use catalog entries @smthrs/effect-tanstack-db, @smthrs/agent ModelStep and @smthrs/model; retain the existing durable engine and projection.

Source deletions remove persisted summaries independently of the visible window and of summary-role configuration. Scoped dispatch fibers isolate stalls and defects. Summary attempts count failed calls and invalid output. Policy refusal is `refused`; other provider failures remain `unavailable`, and `no_route` remains `unconfigured`. Deletion logs, spans and counts contain no message content.

Latitude baseline `pnpm test src/features/timeline`: 19 tests passed. Added regressions on the original implementation: eight failures covering deletion, stalled dispatch, defects, call counts and refusal. A separate original-steps run confirms the actual `unavailable` versus expected `refused` mismatch. The real SQLite deletion regression also fails against the original store, then passes against the fixed store and verifies absence after reopening the database. Final run: all 23 tests passed. Both baseline and final focused runs exit 1 on the unchanged application-wide 100% coverage thresholds; no threshold was reduced. Final `pnpm exec smithers-build test //apps/mvp:importRules` passed.

The successful replay test uses a scripted model. That source observation is confirmed, but it has no failing behavioral reproduction or validated real-provider replacement in the credential-free test farm; it is not claimed fixed.

Mac mini `pnpm e2e timeline.spec.ts` failed before summary assertions: `/api/questions` returned 503 rather than 202. The browser baseline comparison could not acquire a farm slot after ten minutes and was cancelled; no passing browser check is claimed.
