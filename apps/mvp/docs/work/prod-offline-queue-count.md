---
title: Restore the production offline queue count
status: blocked
area: chat
owner: Codex prod-local-first
updated: 2026-10-22
links: [../decisions/0002-local-first.md, local-first.md]
---

Investigate the missing Connection pill count for offline questions on production.
Retain a regression that fails before the fix; validate locally through mini-run,
including local-first.spec.ts and a GIF. Production validation belongs to the deployer.

The production screenshots and device chapters show the count failure after offline
reload/restart, when the branch conversation is no longer selected. The initial
offline asks and their queued badges worked. There is one Connection region.

The retained real-device integration regression failed with `place.conversationId`
null after reopening offline, then passed after registering a persisted route to
conversation mapping. The saved surface is read-only; no workspace permission is
stored. A second regression reproduces a stale restore overwriting home; navigation
generations now fence completion after disk waits. Cache writes and refusal removal
wait for their persistence receipts.

Library catalog: `@smthrs/effect-tanstack-db` for persisted collections and existing
live queries; `@smthrs/ui` for the existing conversation and pill. This is core route
identity, not a new plugin feature. No new visible text.

Validation:

- Red first: real device restore selected home instead of the saved branch
  (`/tmp/prod-local-first-restore-red.log`); retained regressions also catch stale
  restores after leaving/aborting and false-online transport outages.
- `vitest run` for branch actions, offlineConversation, conversation, branch screen
  connection/offline and device schemas: 62 passed; branch actions/store each meet
  unchanged 100% coverage gates (`/tmp/prod-local-first-coverage-final.log`).
  Isolated fixture: `DATABASE_URL=postgresql://smithers:smithers@localhost:55361/smithers`,
  `TEST_DATABASE_PORT=55361`, `TEST_ELECTRIC_PORT=30361`.
- `pnpm --dir apps/mvp typecheck` and `smithers-build test //apps/mvp:importRules` pass.
- `BASE_URL=https://localhost:14561 pnpm --dir apps/mvp e2e local-first.spec.ts
  --grep 'offline branch:' --workers=1`: passed; two queued questions, count 2,
  reload and closed/reopened tab, one pill, no cached workspace grants.
- `e2e:gifs /tmp/prod-local-first-proof-complete`: one video/GIF, zero failed checks.
  GIF: `~/Desktop/smithers-mvp/gifs/local-first-offline-branch.gif`.
- Full `local-first.spec.ts --workers=1 --max-failures=2` on the isolated stack:
  both original offline queue/reload assertions pass, then two answer waits fail
  because no working model is configured; 15 tests did not run
  (`/tmp/prod-local-first-suite.log`). No production e2e ran.
- Astra review completed; findings fixed with regressions. Fable is unavailable.

Blocked on the requested full farm validation: `mini-run` is absent from this
session and no model credential is configured. The brief prohibits modifying the
farm; its slots were untouched. The isolated local stack supplied browser proof,
not a claim that the requested full farm suite passed. Deployment and production
validation remain with the deployer.
