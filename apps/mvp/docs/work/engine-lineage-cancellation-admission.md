---
title: Engine lineage cancellation and admission regressions
status: done
area: flows-engine
owner: codex-flowengine-231463
updated: 2026-10-21
links:
  - packages/smithers/flows/engine
---

Reproduce and repair the seven reported engine cancellation, follower, authorization and admission findings in an isolated jj workspace. Run unit and real HTTP integration tests on Latitude. Library catalog entry: durable workflow execution, `@smthrs/flow`, with the existing `@smthrs/engine` driver.

Reproduction receipts (Latitude, original production code):

- `pnpm exec vitest run test/JoinAuthority.test.ts test/MemoryAdmissionConcurrency.test.ts`: three failing assertions; conflicts reported `unknown`, and the closed-registration admission raised `TypeError` from joining an undefined fiber.
- `pnpm exec vitest run test/Placement.test.ts test/JoinedParentWake.test.ts`: three failures; automatic interrupt omitted ceilings, completed remote execution sent an interrupt, and a joined parent stayed suspended.
- `pnpm exec vitest run test/DiscardFailureObserver.test.ts`: failure; the discarded follower emitted no observed failure log.
- `pnpm exec vitest run test/DispatchErrorContract.test.ts`: failure; the real TypeScript checker reported `never` for dispatch's error channel instead of `FlowCycleDetected`.

Repairs retain the request's ceilings and track remote completion, observe discarded follower causes, preserve dispatch's cycle error type, report known authorization status, wake all recorded parents, and revalidate/capture the registration before publishing admission. The obsolete single-parent state field was removed.

Validation: the full Latitude engine suite passed 610 tests in 76 files with 100% statements, branches, functions and lines. `pnpm check` passed after correcting the new test's declared error boundary. A subsequent isolated joined-parent test passed its assertion but failed the package-wide coverage threshold because only one file was selected; the final verification reruns the complete suite without changing thresholds.

Final Latitude receipts: `pnpm exec vitest run` passed 610/610 tests, 76/76 files, with 100% coverage in every category; `pnpm check` passed; `pnpm lint` passed. All seven findings reproduced and were fixed. No push or bookmark movement.
