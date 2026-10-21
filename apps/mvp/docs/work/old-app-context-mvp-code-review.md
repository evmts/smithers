---
title: MVP code review with old app context
status: done
area: review
owner: codex-review-2026-10-20
updated: 2026-10-20
links: [../state.md, ../rulings.md]
---

Review the current `apps/mvp` implementation after reading `apps/app` as architectural context. Findings concern the new app only, with concrete failure scenarios, severity and source locations. This is a review, not an implementation request; preserve existing work in the shared checkout.

Initial observed working-copy revision: `516362db81c239df2a15f9a162d885c25dc63247`. The shared checkout has substantial concurrent changes, so verify cited code again before reporting.

Review completed. The old app was architectural context only; no product code was changed. Four findings remain for implementation:

- P1: account changes after session expiry retain the previous person's device data; `src/features/auth/actions.ts:54`.
- P1: a failed successor-run admission is lost on TODO settlement retry, leaving the next TODO working without a run; `worker/flows/Todo.ts:565`. Applies when `TODO_RUNS=true` (disabled by default).
- P2: queued agent issue writes retain a 15-minute bearer and become permanently refused after expiry; `src/features/issues/writes.ts:166`.
- P2: live reasoning or tool work silent for 30 seconds lets later answers start without the earlier exchange; `worker/Answers.ts:67`.

All four were reproduced at targeted service boundaries. Three Bun probes exited successfully: `/tmp/smithers-mvp-review-probe.ts`, `/tmp/smithers-mvp-review-auth-probe.ts`, and `/tmp/smithers-mvp-review-turn-probe.ts`; matching `.log` files retain their results. Database probes used isolated local Postgres schemas and scoped cleanup. The account probe used actual auth actions and draft collections with in-memory persistence; the ordering probe advanced the recorded timestamp rather than calling a slow provider. Browser/production E2E and the full suite were not run.

The self-contained [review report](/tmp/smithers-mvp-context-review.html) records scenarios, source locations, evidence, fix directions and limits. The attempted Smithers review launch never produced a receipt and was terminated; no independent agent review is claimed.
