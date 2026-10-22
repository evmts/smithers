---
title: Killed-run recovery regression
status: done
area: testing
owner: Codex killed-run-red
updated: 2026-10-22
links: [../features/agent-status.md]
---

Bisect the Latitude recovery timeout, correct the crash simulation or product,
and prove five consecutive status-file passes, status/attention, typecheck and importRules.
Catalog entries: database and durable flows (`@smthrs/database`, `@smthrs/flows`).

Clean-revision Latitude probes (`jj new <revision> -m ""`, one lat-run each):

| Revision | Recovery result |
| --- | --- |
| `998199dc6263` | 90-second timeout, nyc-02 |
| `9ed661b2002c` | pass, 4.798 s, nyc-01 |
| `ec182555b69f` | pass, 5.175 s, nyc-02 |
| `7f519c3102da` | pass, 4.865 s, nyc-02 |
| `f37a6ffe0e79` | pass, 4.517 s, nyc-02 |
| `4bbbcb2eb3d9` | 90-second timeout, nyc-02 |

Breaking commit: `4bbbcb2eb3d9` queues node records and adds `flushDeferred`
to SqlJournal's shutdown finalizer. The crash harness fenced SQL with
`Effect.interruptible(Effect.never)`. After stopping the run, scope close tried
to flush pending records into that permanently parked gate, so it never reached
the new engine. Recovery did not become slower by design.

The injected crash service now fails SQL with `SqlError(ConnectionError)`.
It still gates both connection reservations and every operation on previously
reserved connections, so a crashed engine cannot write. Cleanup can finish,
and the next incarnation recovers from the committed records. No product code,
timeout or recovery assertions changed. Main plus the fix passes the targeted
regression in 4.363 s on nyc-01.

Latitude nyc-02 validation: five consecutive complete status-flow file runs,
10/10 each; killed recovery times 3.294, 3.334, 3.364, 3.219 and 3.364 seconds.
Status, attention and worker Runs suites: 104/104 tests in 13 files.
Coverage disabled for these targeted runs; no coverage claim.
Codex Astra review: no actionable findings.
App typecheck (src, worker, infra and evals) and `//apps/mvp:importRules`
pass on nyc-02. The complete validation call exited 0 in 372 seconds.
Raw receipts: `~/smithers-builders/killed-run-red-proofs/`.
