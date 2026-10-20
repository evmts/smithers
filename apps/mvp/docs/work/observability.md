---
title: Observability for the new app
status: in-progress
area: app
owner: lead (smithers-b3); each feature adds its records; the wiring agent (the allowlist contract and the engine worker's exporter, since about 01:17 on 2026-10-20; its sub-agent A2b reported both done at 02:18); the views fix agent (review 3's finding 2, since about 01:19; reported fixed about 01:58, then sent back for `ViewCodeError.message`; fully done about 02:08 on 2026-10-20)
updated: 2026-10-20
links: [review-round-4.md, app-wiring.md, ../observability.md, ../rules.md, code-reviews.md, agent-ui-rendering.md, local-first.md, flows-and-agent.md, browser-engine-worker-load-hang.md, fable-review-2-fixes.md, docs-check-flow-outcome.md]
---

## What

Every request, answer and sync can be traced end to end, counted and explained from its records alone. The browser sends Effect logs, spans and metrics as OTLP to `/api/telemetry`; ChatApi relays them to Workers Logs beside its own JSON log lines. Every line carries `trace_id` and `span_id`. Records never carry a question, answer, prompt, key or provider error text, and a sentinel test proves it.

## Why

Will: "We have 0 observability. 0 logging. This is a production system. We need to have perfct observability and logging this should even be tested and documented as we add it." And: "great observability of frontend and backend and metrics so we can see how user is using app".

## State

- `observability.md` says every record it lists exists and is tested.
- Gaps: Workers has no metric exporter here, so metrics are log-line fields only. No product-usage metrics, dashboards or alerts.
- [Durable answering](durable-answering.md) renames answer spans and logs; the doc must follow.
- 22:59 on 2026-10-19: W5 (a) adds `smithers_model_tokens` (per role and model, no ids or content in attributes) and updates `docs/observability.md` ([model endpoint](model-endpoint.md)). 23:01: L1's e2e suite includes 0002 §7's no-spinner observer ([local-first](local-first.md)).

- 00:44 on 2026-10-20: L1 added browser records for the outbox, the leader and storage ([local-first](local-first.md)), listed in `docs/observability.md`. **Two observability e2e tests are red** until the Worker's relay allowlist, `TELEMETRY_ALLOWED` in `worker/Chat.ts`, adds those record names and the fields `queued`, `action`, `granted`, `attempt` and `leader`. The lead's wiring checklist has it, and prefers deriving the allowlist from each feature's exported record names in a shared contract, so the browser and the Worker can't drift ([app wiring](app-wiring.md)). Unchanged at 00:54.
- 00:52 on 2026-10-20: the [edge cache](platform-cloudflare-edge-cache.md)'s changeset adds `immutable_cache_requests` and `immutable_cache_bytes`, counted by backend, namespace, operation and outcome, never a key's parts or an entry's content.

- 01:17:57 on 2026-10-20: Codex Astra review 3's finding 2 (P1, reproduced) breaks `obs.content-free`: a generated view's thrown error, which can quote its private props, is exported on the failed `PresentationRealm.render` span. The fix goes through the content-safe `SpanFailure` boundary ([agent UI rendering](agent-ui-rendering.md), [code reviews](code-reviews.md)).

- About 01:17 on 2026-10-20: **the wiring agent took two observability items** ([app wiring](app-wiring.md)). It derives the relay allowlist from a shared contract, so the browser and the Worker can't drift. It gives the engine worker an OTLP exporter, so the device engine's logs, spans and metrics reach the server; until then that engine is unobserved.
- By 01:19: finding 2 is assigned to a views fix agent. On disk at 01:23, `@smthrs/views` ends its spans through `SpanFailure`. Its new `test/ContentFree.test.ts` exports traces, logs and metrics through Effect's OTLP exporters to a collector that keeps every body, and requires a sentinel from the view's props, state or event in none of them ([agent UI rendering](agent-ui-rendering.md)).
- As of 01:44: `worker/Chat.ts` (01:43, mid-edit by the wiring agent) still declares `TELEMETRY_ALLOWED` itself.

- 01:50 to 01:58 on 2026-10-20, on disk and in the scratchpad, unreported:
  - **Allowlist:** `worker/Chat.ts` (01:53) still lists `TELEMETRY_ALLOWED` by hand. The probe `src/telemetry.explore.test.ts` and its output (scratchpad `explore.txt`, 01:50) list each record and its fields as the tab and the engine send them to `/api/telemetry`. Among them: the engine's `browser.runtime.leader`, `model.proxy.stream`, `agent_model_step_calls` and `flows_db_writer_lock_wait`, and the tab's `flow.dispatch`. Best guess: the wiring agent's inventory for the shared contract. `@smthrs/observability`'s relay guide and `api.md` changed at 01:56.
  - **The engine worker's exporter:** `BrowserRuntime.run` takes a `telemetry` layer, "where the worker's own records go", such as `Otlp.layerFetch({ baseUrl: …/api/telemetry, serviceName: "engine" })` (01:57, with a test fixture `Telemetry.ts`).
  - **Finding 2 reported fixed** about 01:58: no view data in spans, logs or metrics, proven by a sentinel test that failed first. Its follow-up, `ViewCodeError.message`, is underway ([agent UI rendering](agent-ui-rendering.md)).

- **About 02:08 on 2026-10-20: review 3's finding 2 is fully done.** Neither a view's thrown error nor a compile error from the model's code reaches traces, logs or metrics, proven by sentinel tests that failed first; `@smthrs/views` has 116 tests at 100% coverage ([agent UI rendering](agent-ui-rendering.md)).
- 02:03 to 02:07 on 2026-10-20, on disk, unreported: **the allowlist comes from a shared contract.**
  - `src/telemetry.ts` (02:07) is "the browser's telemetry contract": every record the tab and its engine worker export, by name, and every attribute they carry, merged from each feature's `contract.ts` (`AGENT_TELEMETRY`, `AUTH_TELEMETRY`, `CHAT_TELEMETRY`, `REPO_TELEMETRY`, `THEME_TELEMETRY`, `FLOWS_TELEMETRY`; 02:03). "ChatApi's relay (worker/Chat.ts) keeps exactly these and drops the rest, and the engine worker exports only these spans … src/telemetry.test.ts fails when they drift."
  - `worker/Chat.ts` (02:04) no longer declares `TELEMETRY_ALLOWED`. The tab's records carry `service.name` `smithers-mvp-web`, the engine worker's `smithers-mvp-engine`.
  - Scratchpad `sizes.txt` (02:08), whose run isn't on record; best guess the engine worker's export before and after keeping only the contract's spans: "before: 7 exports, 3183960 bytes, 3883 spans … after: 4 exports, 53067 bytes, 45 spans".
- 02:12 on 2026-10-20, scratchpad `a2a/cov.log`: one chat test is still red, `src/features/chat/telemetry.test.ts` "asking: asked, stored and not sent, one trace from the ask through the outbox to ChatApi, and the metrics" (61 passed, 1 failed, 1 skipped) ([app wiring](app-wiring.md)).
- **02:18 on 2026-10-20: the wiring agent's sub-agent A2b reports both items done**, to the wiring agent, not yet to the lead ([app wiring](app-wiring.md)):
  - "The engine worker's records now reach ChatApi: its export for one answer dropped from 3.2 MB (3,883 spans in 7 exports of up to 853 KB, all refused by ChatApi's 128 KiB limit) to 53 KB (45 spans in 4 exports, largest 40.6 KB)."
  - **The contract:** `src/telemetry.ts`, with no library imports, exports `BROWSER_TELEMETRY`, `WITHHELD`, `EXPORTED_SPANS`, `RELAY_FIELDS`, `APP_TELEMETRY`, `WEB_SERVICE` and `ENGINE_SERVICE` (`"smithers-mvp-engine"`). Each feature contract adds one export, `REPO_TELEMETRY` included. `worker/Chat.ts` relays with `allow: BROWSER_TELEMETRY`; the hand-written `TELEMETRY_ALLOWED`, with stale names such as "question not taken", is deleted.
  - **The SDK:** `Otlp.Options` gains `spans`; a span off the list is never sent, but its children keep its trace and parent ids. `BrowserRuntime.RunOptions` gains `telemetry`. Changesets `otlp-span-allowlist` and `browser-runtime-telemetry`.
  - **The drift test** (`src/telemetry.test.ts`) runs the tab and the engine paths through the real `OtlpRelay.serve`, with the allowlist and without, and fails on anything dropped that `WITHHELD` doesn't name. Its "every listed name is emitted" half is a source scan, since failure-only records can't be reached at run time.
  - **Tests:** `observability` 206 of 206, `platform-browser` 221 of 221 and `effect-electric` 45 of 45, each at 100%.
- 02:31: A2a's report: the tab's own OTLP exporter now sends only `EXPORTED_SPANS` too ([app wiring](app-wiring.md)).
- 03:18 to 03:22 on 2026-10-20, on disk, unreported: two new browser-engine records from the `platform-browser` agent: the log `browser.engine.unavailable` (`reason`, `error.type`) and the counter `smithers_browser_engine_unavailable` by `reason`, for an engine worker that fails at load ([engine worker load failure](browser-engine-worker-load-hang.md)). Whether the relay's allowlist passes them isn't on record.
- About 03:26 on 2026-10-20: the `platform-browser` agent reported both records done. 03:27:34, on disk, unreported: the app's telemetry contract (`src/flows/contract.ts` `FLOWS_TELEMETRY`) lists `browser.engine.unavailable` and `smithers_browser_engine_unavailable`, so the relay passes them; the app's `docs/observability.md` documents both (03:28:22). No e2e case shows them reaching the server yet.
- 03:51 to 03:54 on 2026-10-20, on disk, unreported: two new records from the wiring agent's sub-agents. `effect-tanstack-db` counts `persistence_write_failures` by `collection` and `operation`, and the app's chat telemetry contract lists it. `chat/Expire` counts `smithers_answer_expiries` by `outcome` ([app wiring](app-wiring.md)).
- 04:00 to 04:03 on 2026-10-20, on disk, unreported: the app's `docs/observability.md` documents `chat.answer.expire`, `smithers_answer_expiries` and `persisted write failed`. The drift test is red at 04:02 (scratchpad `d2-test.log`): the contract (`src/flows/contract.ts`) lists `browser.engine.worker`, and no source emits it ([app wiring](app-wiring.md)).
- 04:07:48 on 2026-10-20, on disk, unreported: the contract drops `browser.engine.worker`, which no source emitted; the drift test is green in the 04:12 unit run (scratchpad `wiring/unit3.log`). Sign-out's extra `persisted write failed` line was still red there; a fix in `src/features/auth/actions.ts` is on disk at 04:13, and the 04:14 unit run is green: 491 passed, 4 skipped, coverage 100% (scratchpad `wiring/unit4.log`) ([app wiring](app-wiring.md)).
- 04:23 on 2026-10-20 (scratchpad `wiring/e2e-3.log`): both observability e2e cases (correlation, redaction) pass in the full serial run ([app wiring](app-wiring.md)).
- 05:53:06 on 2026-10-20 (scratchpad `wiring/e2e-fresh.log`): both observability e2e cases pass in the final fresh-state run, correlation ("the browser's ask, its agent's dispatch and ChatApi's chat.question and chat.answer.write records share the answer id") and redaction; the wiring agent reported at 05:54:14 ([app wiring](app-wiring.md)).
- **06:08 on 2026-10-20: Fable review 2's P3-4:** `/api/telemetry` accepts 128 KiB OTLP exports from anyone, as often as they like, and the shape relay is open too (`worker/Chat.ts:104-109,179-180`). The worker fix agent adds rate and size limits, or the minimum safe version if decision 0008 phases them, since 06:09:12 ([Fable review 2 fixes](fable-review-2-fixes.md)).
- **07:01:52 on 2026-10-20: P3-4 fixed as the minimum safe version** ([Fable review 2 fixes](fable-review-2-fixes.md)): `/api/telemetry` and every shape are limited per network at 3,000 requests a minute, `429` with a 60-second retry, metric `smithers_throttle_decisions`; telemetry keeps its 128 KiB size cap. The limits are not from a load test.
- 07:07:38 on 2026-10-20: with the remote door removed, the constant `placement` telemetry field is gone ([flows and the agent](flows-and-agent.md)).
- From 06:45 on 2026-10-20: agents can't read whether `pnpm docs:check` passed, a records gap in the Smithers CLI ([docs check outcome](docs-check-flow-outcome.md)).

- **11:01 to 11:04 on 2026-10-20: [review round 4](review-round-4.md)'s telemetry findings, unrouted by 11:07.**
  - R4-13 (P2, Claude Fable): the Electric secret travels in the gateway's URL, which persisted Workers Logs record ([IaC](infrastructure-as-code.md)). The root rule keeps secrets out of telemetry.
  - Claude Opus P3-5: `src/telemetry.ts:56-58` keeps `url.full`, `url.path` and `url.query` for every client span, so each `GET /api/repos/<owner>/<name>/blob/<sha>/<path>` (`features/repo/api.ts:110`) exports the repository's file paths, while `features/navigation/contract.ts:32-34` says a path "can carry content" and records none. Fix: relay the route template only (`/api/repos/:owner/:name/blob/:sha/*`) and drop `url.full` and `url.query`.
  - Claude Fable S-P3-1: `GitProxy` counts a 2xx as `ok` before the body streams, so a pack that breaks off is recorded `ok`; `ShapeProxy` records on `Stream.onExit` (`packages/effect-code-storage/src/GitProxy.ts:147-148`).

## Next

From 11:07 on 2026-10-20: as before, plus the lead's routing of round 4's telemetry findings: R4-13 and Opus P3-5 ([review round 4](review-round-4.md)).

Until 11:07 on 2026-10-20 the next step was, from 07:01 on 2026-10-20: the relay limits are done. Next: usage metrics for "how users use the app", then dashboards and [token-spend alerts](token-spend-alerts.md).

Until 07:01 on 2026-10-20 the next step was, from 06:09 on 2026-10-20: the worker fix agent's relay limits for `/api/telemetry` (P3-4, [Fable review 2 fixes](fable-review-2-fixes.md)). The two observability e2e cases are green in the final fresh-state run (05:53).

Until 06:09 on 2026-10-20 the first step was, from 02:35 on 2026-10-20: the wiring agent's report, with the two observability e2e tests green in a real browser. They wait for the engine worker to load in the app ([app wiring](app-wiring.md)). The allowlist contract, its drift test and the engine worker's exporter are done (A2b, 02:18).

Until 02:35 on 2026-10-20 the first step was, from about 02:08: the wiring agent's report: the two observability e2e tests and the chat telemetry test green, the shared contract's drift test passing, and the engine worker's records at the server ([app wiring](app-wiring.md)). The views fix is done.

(Until about 02:08 the first step was: the wiring agent's report: the two observability e2e tests green, the allowlist derived from a shared contract, and the engine worker's records at the server. And the views fix agent's report.)

Then usage metrics for "how users use the app", then dashboards and [token-spend alerts](token-spend-alerts.md).

## Questions for Will

- Which usage questions should the metrics answer first? Proposed: daily askers, asks per person, time to first answer text.
