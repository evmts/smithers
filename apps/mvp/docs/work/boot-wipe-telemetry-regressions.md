---
title: Boot, wipe and telemetry regressions
status: blocked
area: browser
owner: codex-fix-apps-mvp-src-942864
updated: 2026-10-21
links: []
---

Reproduce the eight reported startup, wipe and telemetry findings on the mini farm. Keep the browser host boundaries and use the catalog observability entry (`@smthrs/observability`) for relay validation.

## Reproduction

On the mini, `pnpm vitest run src/wipe.test.ts src/device/identity.test.ts src/telemetry-privacy.test.ts --coverage.enabled=false` failed exactly five regressions (21 passed): activation selected memory during preparation; the relay retained the credential sentinel; an unreadable mark and failed directory lookup returned clean; synchronous stop threw and never reloaded.

After the fixes, `pnpm vitest run src/wipe.test.ts src/device/identity.test.ts src/telemetry-privacy.test.ts src/telemetry.test.ts --coverage.enabled=false` passed all 35 tests. Additional coverage checks include preparation refusal/rejection and a mark becoming unreadable during lock acquisition.

## Findings without a reproduced bug

- Repeated session checks occur at distinct ownership boundaries (known-owner preflight and leader receipt). No independent behavioral failure was reproduced from their duplicated logic; no refactor made.
- The existing one-record export difference is correct: only `browser.runtime.request` intersects the permitted record list. The exact-set regression passes on the original code. No production change made for this finding.

## Pending

The six reproduced findings are fixed and the 35 focused tests passed on the mini. Full-package verification remains blocked: `mini-run apps/mvp -- sh -c 'pnpm test --maxWorkers=4 --coverage.reporter=text-summary ...'` never acquired a farm slot despite an extended wait and one requeue. Both queued requests were canceled before execution. All four slots remained occupied by other runs; the mini reported a load average around 35. No other run was interrupted, and no full-suite pass or coverage result is claimed.

No push, bookmark movement or deployment is part of this change.
