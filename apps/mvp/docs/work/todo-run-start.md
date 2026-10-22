---
title: TODO run admission and durable drop
status: blocked
area: todos
owner: Codex SOLC todo-run-start
updated: 2026-10-22
links: [../decisions/0026-watching-a-todo-run.md]
---

Trace remote admission from writer through Durable Object to engine, reproduce admission delays, and cancel dropped attempts through the engine. Use the catalog's @smthrs/platform-cloudflare host and @smthrs/flow durable runtime; no application retry loop. Local commits only per SOLC brief.

Implementation: correlated writer/DO/runtime/create/claim records; immediate duplicate alarms and five-second host retry cap; durable cancellation tombstone and engine interrupt; current-attempt admission guard; drop receipt inherits published starts; independent durable recorded-PR cleanup. Catalog entries: @smthrs/flow, @smthrs/platform-cloudflare, @smthrs/engine-store. No new dependency or application retry loop.

Red-first evidence: missing request/create/claim telemetry; postponed duplicate alarm and exponential backoff; pre-start and running cancellation; production no-op stop; cancellation ordered after failing successor start; missing published successor receipt; PR left open after cancellation; missing cleanup start; cancellation failure leaking content; cleanup admission error-code loss. Each has a retained regression test and a green targeted run.

The historical incident cause is unproven: the tests reproduce two delay mechanisms in the old host, not the missing historical Worker trace. The Postgres capacity-recovery test uses the Effect test clock; it proves the next bounded alarm creates and claims the run, not a production wall-clock SLO.

Validation blockers: local Playwright todo e2e never started because CEREBRAS_API_KEY is absent; full pnpm docs:sync fails closed because smithers-jj-export is missing (site sync itself passes). Production was not deployed or tested, per the brief's local-only delivery. Astra reviewed and its findings were fixed; no Fable tool/model was available. Do not claim production verification or 100% coverage of the Alchemy-only wiring. Cleanup cannot discover a PR whose publication never reached Postgres; it never infers ownership from a branch.

Validation commands (Node 26.5.0):

- `pnpm --filter @smthrs/platform-cloudflare exec vitest run test/Cancellation.test.ts test/ExecutionObject.test.ts test/AdmissionLatency.test.ts test/Observability.test.ts test/Routing.test.ts test/Crash.test.ts --maxWorkers=1 --coverage.include=src/ExecutionObject.ts`: 59 passed; 100% statements, branches, functions and lines for ExecutionObject. The additional real-Postgres recovery test subsequently passed in the three-test AdmissionLatency suite.
- `pnpm --filter @smthrs/engine-store exec vitest run test/RunDriverGuards.test.ts test/RunUsageMetrics.test.ts test/CancelParked.test.ts test/DurableCancel.test.ts test/CrossDriverCancelSettles.test.ts --maxWorkers=1 --coverage.enabled=false`: 14 passed.
- App selection: `worker/stack/{Stack,Api,TodoRuns}.test.ts`, `worker/ExecutionHost.test.ts`, `worker/flows/{TodoHost,TodoDrop,Todo}.test.ts`, `worker/github/Host.test.ts`, `worker/RemoteRuns.test.ts`, serially through Vitest; 136 passed. `worker/flows/TodoRecovery.test.ts` also passed in the earlier serial run.
- Worker, platform-cloudflare test and platform-browser test TypeScript checks passed. ESLint passed for ExecutionObject, EngineStore and RunDriver. `pnpm exec smithers-build test '//apps/mvp:importRules'` passed.
- `pnpm --filter @smithers/site run sync:docs` passed; generated projections are included. `pnpm docs:sync` and `pnpm --filter @smthrs/mvp exec playwright test e2e/todos.spec.ts --workers=1` hit the blockers above.

Local delivery only: no push, deployment, production test or lander submission.

Final validation status: blocked, not a green final gate. The expanded 136-test app run passed every test but measured 99.71% statements / 100% branches / 98.92% functions / 99.67% lines across the five selected production files; its only uncovered line was the older standalone `recordStart` wrapper. The host test now exercises adoption of an intent recorded through that wrapper. The subsequent app rerun hit the existing chat/Expire timeout and a missed lease heartbeat in TodoDrop, then was interrupted rather than continued under saturation. Mac load average was 83.28. The final SDK run passed 58/60, including all four cancellation cases and the newly added admission-refusal telemetry assertion, but routing telemetry and real-Postgres latency timed out. Earlier runs of those same cases passed. No timeout or coverage threshold was relaxed; final full changed-code coverage remains unproven.
