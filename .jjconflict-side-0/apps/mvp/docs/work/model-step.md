---
title: ModelStep, the durable model call
status: done
area: sdk
owner: W3 agent-package agent (finished); its leftovers closed by the SDK defects agent at 22:47
updated: 2026-10-19
links: [../features/chat.md, ../rules.md, ../../../../docs/libraries.md, durable-answering.md, model-host-effect-boundary.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, durable-browser-engine.md]
---

## What

`ModelStep.run` in `@smthrs/agent` calls a model as one durable, sealed step of the running flow. Its key digests the credential-free request, so a new API key keeps the key and a changed history, model or base URL makes a new one. Transport faults retry inside the step with byte-identical bodies; a 429 fails unsealed so the flow's retry policy retries it. `FlowEngineLike` now uses the same implementation, so the agent loop and `ModelStep` share one key and one recorder.

## Why

Will: "whatever abstraction we have that is doing the model call should be durable by default just like all of smithers because the base layer is durable flows". And: "Make sure we even have a test working that makes sure we are properly using it without breaking the cache."

## State

- Built: `packages/smithers/agent/src/ModelStep.ts`, `test/ModelStep.test.ts` and the agent changelog entry.
- Counters `agent_model_step_calls`, `agent_model_step_replays` and `agent_model_step_redispatches`.
- Kill tests across real processes pass: one call after a kill past the seal; a re-issued call and a counted redispatch after a kill mid-flight.
- Added since: span-failure withholding in the core, so provider error text stays out of spans.
- Running at 21:21 on 2026-10-19: syncing its SDK docs (`pnpm docs:check`) and updating the shared test stack, child-process fixture and call sites.
- No consumer yet; the app still calls `Model.stream` directly. Uncommitted.
- 21:29: still running. Its landing gates the [model-host Effect-boundary fix](model-host-effect-boundary.md), since the two packages sit side by side.
- 21:43: the lead lists W3 as still running. No report yet; `docs/libraries.md` has no `ModelStep` row.
- About 21:44: W3 reported done. Uncommitted.
  - API: `ModelStep.run({ name, request, model, route, retryPolicy?, heartbeatTimeoutMs?, onEvent? })`. W3 split the brief's `route` into `model` and `route`, matching `HostModel`, so a host calls `ModelStep.run({ name, request, model: host.model, route: host.route })`. `HostModel` needs no change.
  - One implementation: `src/internal/ModelStep.ts` (renamed from `internal/FlowEngineLike.ts`). `FlowEngineLike` keeps its public exports, and step keys stay byte-identical (`StepKeyGolden` passes).
  - Capacity errors fail unsealed for `retryPolicy` to retry: 429 `quota_exceeded`, `provider_internal` after in-step retries, and HTTP 503, 504 and 529. Other provider errors are sealed as `result.error`. A retry attempt starts with a `retry` event so a consumer drops partial text.
  - 22 cases on real Postgres, with real SIGKILL: 1 call when killed after the seal; a re-issued call and redispatch counter 1 when killed mid-call; 0 calls on a settled rerun; the same key across key order, processes and API keys; byte-identical bodies on an in-step retry; heartbeat timeouts; a sentinel proving prompt, provider error text and key reach no log, span or metric.
  - Agent suite: 2,064 pass, 1 fails (`CellFlows`, a stale prompt snapshot from an upstream `cellPrompt.ts` sentence). Coverage: lines and functions 100%, statements and branches 99.97%; the gap is a dead `instanceof HarnessError` branch at `StandardFlows.ts:95`, unchanged by W3. `tsc`, eslint, dprint, the circular check, `pnpm docs:sync` and `pnpm docs:check` pass.
- Leftovers, given about 21:45 to the [SDK defects agent](model-host-effect-boundary.md): the `StandardFlows.ts:95` branch (type `publicError` in `@smthrs/harness` to exclude `HarnessError`, then delete it) and the `CellFlows` snapshot.
- W3's four engine asks went to W1 ([durable answering](durable-answering.md)): a re-run attempt flag, span failure text, a false WARN, and the Retry-After field name (`RetryPolicy.decide` reads `retryAfterMs`; `ModelError` carries `retryAfterMillis`). At 21:54 W1 is removing the two `ModelStep` shims in favor of the engine's signals.
- 21:55, on disk: `src/internal/ModelStep.ts` changed again, and the agent changelog says a step tells a re-issued call from a first one by `@smthrs/flow`'s `Action.CurrentRedispatch`, W1's engine signal, in place of a `ModelStep` shim.
- About 22:00: `docs/libraries.md` has `ModelStep` in its job table, the `@smthrs/agent` row and "Which to pick" ([library catalog](library-catalog.md)).
- 22:08: Will stopped both agents holding this item's follow-ups: the SDK defects agent (the dead branch is deleted on disk; the `CellFlows` snapshot is unresolved) and W1 (the engine asks). `ModelStep` itself stays done; its first consumer, W5, waits on W1.
- 22:16: Will said the stop was unintentional. 22:17: the lead restarted both agents; fresh replacements started about 22:20 and continue from the work on disk.
- 22:31: decision 0011: the browser agent's model calls are `ModelStep`s on the [durable browser engine](durable-browser-engine.md), routed through the server's [model endpoint](model-endpoint.md). A crash mid-call re-runs that one call on resume, as on any host; a sealed result is never fetched again. The first consumer is now the browser agent, not W5's `chat/Answer`.
- 22:47: **both leftovers closed** by the SDK defects agent ([model-host Effect boundary](model-host-effect-boundary.md)). The dead `HarnessError` branch is gone, with a type test in its place. The `CellFlows` snapshot change was intended, from upstream commit `56a3eedc9b48` (#4284), and the snapshot was updated. All touched packages are at 100% coverage.
- 22:58: W1 added a Retry-After test: a real 429 `ModelError` through `ModelStep` on compose Postgres, so the step waits as long as the provider asked. `@smthrs/agent` passes 2,066 tests at 100% coverage, `ModelStep` 23 of 23. `ModelStep`'s own workarounds were already gone ([durable answering](durable-answering.md)).
- 23:01: [Codex checkpoint review 2](code-reviews.md) found no defect in `ModelStep`.

## Next

Done. Follow-ups that belong to other items:
- The coverage gap and snapshot: [model-host Effect boundary](model-host-effect-boundary.md). (Closed 22:47.)
- The engine asks: W1 in [durable answering](durable-answering.md).
- First consumer: W5 makes `chat/Answer` call `ModelStep`, with the caching tests (one call when killed after the seal, zero on a rerun of a settled answer). (Changed 22:31 by decision 0011: the first consumer is the browser agent, with the same caching tests.)
- A `ModelStep` row in `docs/libraries.md` ([library catalog](library-catalog.md)): added about 22:00 by the lead (job row, `@smthrs/agent` row, "Which to pick").

## Questions for Will

None.
