---
title: Finish session recovery and visitor adoption
status: blocked
area: auth
owner: Codex (trackc17)
updated: 2026-10-22
links: [local-first-correctness.md, ../decisions/0023-device-ownership-and-queued-authority.md]
---

Restore C1 and C2 from the session builder, repair their test layers and Effect boundaries, and validate each commit independently for the lander.
Libraries: the catalog entries `@smthrs/flow`, `@smthrs/platform-browser`, and `@smthrs/effect-tanstack-db` supply durable refresh, activation and owner-scoped delivery.

## Repairs

C1 restores the durable `auth/refresh` flow and provides the real `FlowRegistry.layer` to auth and telemetry tests. The rejected test-host hunk retains main's run channel and adds the session channel.

C2 adopts visitor data in place without granting authority over another owner's or unstamped queued writes. Identity requests run as a scoped stream inside `BrowserRuntime.run`, with engine telemetry provided to that stream. Adoption follows the HTTP request's existing Effect deadline through its abort signal; no page timer or nested Effect runtime remains. The two sleep violations now await observable state. The original patch's unrelated boot connectivity/history and attention focus assertions are retained.

A focused send-fault regression reproduced a test race: `sentQuestions` proves launch, so Retry could precede completion of a fault that awaited ChatApi. The fault matrix now also waits for the real `Outbox.attempts` retry receipt before Retry (duplicate succeeds and needs no failure receipt). The assertions, deadlines, lint rules and coverage thresholds are unchanged. Astra reviewed the implementation and this repair; both findings were resolved. A Fable review was unavailable in this session (no tool or local Claude executable).

## Original stack validation — 2026-10-22

Node 26.5.0; `pnpm install --frozen-lockfile` passed. No push, deploy, merge or rule exception.

At C1 alone and at the tip:

- `pnpm --filter ./apps/mvp exec tsc --noEmit -p .` passed.
- `pnpm smthrs test //apps/mvp:importRules` passed. This target is a NodeTest; the lint verb rejects it.

C1: `pnpm --filter ./apps/mvp exec vitest run src/device src/features/auth src/flows/registry.test.ts src/telemetry.test.ts` ran 100 tests: 98 passed, two telemetry cases failed under load. The isolated telemetry rerun passed four, with the tab case still red; untouched main also fails that case (its contract drops `timeline.summary.unconfigured`, which C2 includes). `pnpm --filter ./apps/mvp exec vitest run src/features/auth --maxWorkers=1` subsequently passed all 24 assertions. Focused runs retain the app-wide coverage gate and therefore exit nonzero for insufficient whole-app coverage.

The full requested tip selection was:

```sh
pnpm --filter ./apps/mvp exec vitest run src/device src/features/auth src/boot.test.ts src/features/attention/attention.test.ts src/features/chat/chat.test.ts src/flows/engine.test.ts src/flows/registry.test.ts src/telemetry.test.ts src/test/e2e.test.ts --maxWorkers=2
```

It ran all 193 tests: 148 passed, 45 failed. The same selection on untouched main `7f16c873853d`, with `--maxWorkers=1`, ran 181 tests: 158 passed, 23 failed (chat, attention, telemetry, test/e2e). Main was checked in a temporary jj workspace using the installed dependencies; its tracked source was unchanged. The higher-load tip run also logged expired engine leases. Read-only `pg_stat_activity` showed shared Postgres WAL-write waits around 15 seconds; no database settings were changed.

All tip failures absent from the main failure set were rerun, without increasing a timeout:

- `vitest run src/features/auth src/flows/engine.test.ts --maxWorkers=1`: 30/30 assertions passed.
- `vitest run src/device/identity.test.ts src/device/migrations.test.ts src/device/schemas.test.ts`: 50/50 passed, including the TestClock adoption deadline regression. Main: 47/47 passed; both commands fail the unchanged app-wide coverage gate (tip 5.86% lines; main 5.78%).
- `vitest run src/features/chat/chat.test.ts -t <14 names absent from main's failures> --maxWorkers=1`: 13 passed, invalid_response red. Its repeated isolated red led to the receipt repair above; `vitest run src/features/chat/chat.test.ts -t 'a send that fails as' --maxWorkers=1` then passed all five cases. The 14-case selection is retained at `/tmp/trackc-unmatched-chat-cases.txt`.
- `vitest run src/features/attention/attention.test.ts src/telemetry.test.ts --maxWorkers=1`: 11 passed, one attention Retry case red. `vitest run src/features/attention/attention.test.ts -t 'Retry on a failed run' --maxWorkers=1` then passed that case. All five telemetry assertions passed.
- `vitest run src/boot.test.ts -t 'the repository layer' --maxWorkers=1`: passed. The restored connectivity/history test also passed in the full run.
- `pnpm --filter ./packages/smithers/flows/platform-browser exec vitest run test/BrowserRuntime.test.ts`: 16/16 passed. Main: 15/15 passed; both hit exactly the same package-wide coverage failure (36.4% lines, 100% threshold).

These focused runs do not establish a green full-suite or 100% whole-app coverage result. The broad run's baseline failures remain visible; no threshold was lowered or code excluded.

`pnpm --filter ./apps/mvp exec playwright test e2e/sign-in.spec.ts --list` collected 13 tests. Browser e2e (local and production) was not executed. `pnpm docs:sync` ran its documentation generators but failed when the durable docs-sync flow required the missing `smithers-jj-export` native helper. No deployment was attempted.

Raw receipts: `/tmp/trackc-c1-{tsc,importRules,tests,telemetry,auth-isolated}.log`, `/tmp/trackc-{final-tsc,final-importRules}.log`, `/tmp/trackc-c2-{tests-2,device-pure,browserRuntime,auth-engine-final,chat-unmatched,send-receipts,attention-telemetry-final,attention-retry-final,boot-final}.log`, and `/tmp/trackc-main-{all-tests,device-pure,browserRuntime,auth-expiry,invalid-response}.log`.

## Track C replay — 2026-10-22

Replaying onto main `9b86879e3606`. Earlier validation above belongs to the original stack, not this replay. Refresh enforcement follows main’s shared person-only table; main’s watch failure cleanup and live attention remain. Visitor adoption keeps the recovered-device branch reopen and conversation wait. New Latitude and mini receipts will be recorded here.

### Replay receipts

All installs and checks ran remotely; no local node_modules, push, or deployment. Source was plain `9b86879e3606` for each baseline comparison; its temporary jj change was empty.

- C1: full `pnpm typecheck` and `//apps/mvp:importRules` passed on Latitude (`/tmp/trackc17-c1.log`). Tip: both passed and 236/236 selected device, auth, attention, timeline, branch, Actor, person-only, run credential and telemetry tests passed (`/tmp/trackc17-tip-final.log`). Focused app runs disable whole-app coverage and establish no whole-app coverage claim.
- Platform-browser: the complete Node package suite passed 357/357, with executed aggregate coverage 100% (`/tmp/trackc17-platform.log`); its separate browser configuration was not run.
- All 31 worker suites importing Actor, plus boot, engine and chat, ran 779 tests: 777 passed. ShapeProxy’s message-column case received a non-array response; the chat defect case observed a refusal before the independent outbox write settled. The latter now awaits the existing expected message state with the original deadline. Plain main’s same selection ran 777 tests: 776 passed, and an Edit/reload case failed with a Postgres deadlock; neither tip failure reproduced there (`/tmp/trackc17-worker-docs.log`, `/tmp/trackc17-main-worker-docs.log`). Final serial ShapeProxy/chat verification passed all 79 tests, with full app typecheck and importRules also passing (`/tmp/trackc17-final-serial.log`). ShapeProxy’s earlier failure did not recur in isolation; the corrected chat ordering assertion passed with the unchanged deadline.
- Mini sign-in: 11 passed, one GitHub-only case skipped, one wipe test failed at line 67 (the unsent question remained). Plain main’s full suite: 9 passed, one skipped, the identical wipe assertion failed. Both new recovery/adoption cases and the recovered offline activation passed on the tip. Isolated diagnostics: main’s wipe case passed once; the tip’s retry failed earlier with a missing composer and HTTP 502s, so it did not reproduce the retained-question failure (`/tmp/trackc17-e2e-fixed.log`, `/tmp/trackc17-main-e2e-full.log`, `/tmp/trackc17-main-e2e.log`, `/tmp/trackc17-tip-wipe.log`).
- Copied the requested native helper into this clone’s `target/release` before docs commands. Latitude page generation completed and returned no changed site projections. Tip durable docs sync was stopped after nine minutes without a completion receipt; its subsequent docs check timed out at 120 seconds. Plain main’s docs check and sync also timed out at 120 seconds, after page generation (`/tmp/trackc17-docs.log`, `/tmp/trackc17-worker-docs.log`, `/tmp/trackc17-main-worker-docs.log`). Completed durable docs validation remains blocked; no success is claimed. Production e2e was not run.
