---
title: A request to an engine worker that died while loading waits forever
status: done
area: sdk
owner: the `platform-browser` agent, reported done about 03:26 on 2026-10-20 (the SDK half, test first in real Chromium); the app half is on disk 03:27 with the wiring agent, unreported ([app wiring](app-wiring.md)). Until about 03:26: the `platform-browser` agent, resumed about 03:15 on 2026-10-20 for this fix (SDK half on disk 03:17 to 03:22, unreported); the wiring agent shows it in the app's engine-failure message. Until about 03:15: unassigned; found by the agent-root SDK agent (report 03:15:18 on 2026-10-20)
updated: 2026-10-20
links: [agent-root-browser-safe.md, durable-browser-engine.md, b1-follow-ups.md, app-wiring.md, one-sqlite-one-leader.md, observability.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../../../../AGENTS.md, ../observability.md, ../state.md]
---

## What

`@smthrs/platform-browser`'s `BrowserEngine` only logs an engine worker that dies while it loads. A request the tab already sent (`start`, `result`, `cancel`) never settles. The fix: a load failure fails every pending and later request with a typed error that carries the cause.

## Why

On 2026-10-20 the engine worker died at load with `document is not defined` ([agent root in the browser](agent-root-browser-safe.md)), and the app hung until a 30 s fallback. The app now says "Smithers can't run in this browser" when `SharedSqlite.open` gives up ([app wiring](app-wiring.md)), but a request already in flight to the engine still waits forever. A failure that hangs instead of surfacing breaks "durable by default" in the root `AGENTS.md`: the engine supplies the deadline, not each caller.

## State

- 03:15:18 on 2026-10-20: the agent-root SDK agent's report, item 9: "`BrowserEngine` only logs a worker that dies while loading, so a request already sent waits forever." Left open, no owner.
- On disk, `platform-browser/src/BrowserEngine.ts`: the worker's `error` listener runs `Effect.logError("browser.engine.worker")` with the error's type and nothing else. `request` posts the message and awaits its reply `Deferred` with no failure path for the worker.
- 02:52:39 on 2026-10-20: the agent's real-Chromium harness (`platform-browser/test/browser/app/agent.ts`) races each call against the worker's load error, "so a worker that dies while it loads fails the test with its cause instead of hanging". That is a test-side guard for the same gap.
- **About 03:15 on 2026-10-20: the lead resumed the `platform-browser` agent for it.** Scope: fail pending and later requests with a typed `EngineUnavailable`; expose the state to the app's engine-failure UX; record a log line and a metric; a real-Chromium regression test.
- 03:17 to 03:22 on 2026-10-20, on disk in `packages/smithers/flows/platform-browser`, unreported:
  - **Test:** `test/browser/Unavailable.test.ts` (03:17:19), real Chromium. A worker that throws at load makes a `start` fail within 5 s with `EngineUnavailable`, reason `worker-failed`, and `harness.unavailable()` returns `{ reason: "worker-failed", error: "ErrorEvent" }`. Unit cases in `test/BrowserEngine.test.ts` (03:21). No run is on record, so "fails first" is unproven.
  - **Fix:** `src/BrowserEngine.ts` (03:18:58) and `src/internal/Engine.ts` (03:21). `EngineUnavailable` is a tagged error with `reason` (`worker-failed` when the worker throws, `engine-failed` when no engine can be built) and `error`, a tag. `start`, `result`, `cancel` and `signal` can fail with it. A new `unavailable` effect completes with why. `WorkerLike` also takes `message` listeners, on which the worker reports an engine it couldn't build.
  - **Records:** the log `browser.engine.unavailable` with `reason` and `error.type`, and the counter `smithers_browser_engine_unavailable` by `reason` ([observability](observability.md)).
  - **Docs:** `docs/api.md`, `docs/troubleshooting.md` ("EngineUnavailable: worker-failed or engine-failed"), `docs/concepts/durable-browser-engine.md` and `CHANGELOG.md` (03:22). The changeset text sits in `.changeset/browser-shared-sqlite.md`.
  - `apps/mvp/src` doesn't read `EngineUnavailable` yet ([app wiring](app-wiring.md)).
- **About 03:26 on 2026-10-20: the `platform-browser` agent reported done.** The lead to Will, 03:26: "If the engine worker dies or can't start, every request now fails within 5 seconds with a typed error."
  - **Error:** `BrowserEngine.EngineUnavailable` carries `reason` `worker-failed` or `engine-failed`. `BrowserRuntime.run` posts the failure to its tab, and `BrowserEngine.unavailable` exposes it.
  - **Records:** the log `browser.engine.unavailable` and the counter `smithers_browser_engine_unavailable` ([observability](observability.md)).
  - **Fails first:** the real-Chromium regression test timed out at 60 s on the old code; it now fails the request in under 5 s.
  - **Tests:** 230 Node tests at 100% coverage; Chromium 11 of 11.
  - **Handed to the wiring agent:** replace `tabEngine`'s hand-built `EngineHealth` with `BrowserEngine.unavailable`, deleting the duplicate, and map `EngineUnavailable` to the engine-failure state.
- 03:27 to 03:28 on 2026-10-20, on disk in `apps/mvp`, unreported: the app half.
  - `src/flows/engine.ts` (03:27:22): `failFastOnEngine` races the device store's `open` against `BrowserEngine.unavailable` and fails it with `EngineFailed`, so `Persistence.layer` keeps the rows in memory instead of waiting for a leader that never answers. No `EngineHealth` remains in `src/`.
  - `src/features/chat/store.ts` (03:27:30): the Connection pill reads `unavailable` and says "Smithers can't run in this browser", with Reload, until the page reloads.
  - `src/flows/dispatch.ts` (03:27:30): `DispatchFailed` gains the reason `unavailable` for an `EngineUnavailable`.
  - `src/flows/contract.ts` (03:27:34): the telemetry contract lists `browser.engine.unavailable` and `smithers_browser_engine_unavailable`, so the relay passes them.
  - Docs: `docs/state.md`, `docs/features/flows.md` and `docs/observability.md` (03:28:22).
  - No e2e case where the engine worker fails is on record.

## Next

From about 03:26 on 2026-10-20, this item is done for the SDK. The app's proof comes with the wiring agent's report: an e2e case where the engine worker fails shows "Smithers can't run in this browser" at once, and a request in flight fails with `unavailable` ([app wiring](app-wiring.md)).

Until about 03:26 on 2026-10-20 the next step was, from about 03:22: the `platform-browser` agent's report. Proof: `Unavailable.test.ts` fails on the 03:15 code and passes now; 100% coverage; `pnpm docs:check`. Then the wiring agent reads `BrowserEngine.unavailable` in the app's "Smithers can't run in this browser" message, with an e2e case where the worker fails. Then this item is done.

Until about 03:15 on 2026-10-20 the next step was: assign it once the wiring step stops editing `platform-browser`. Test first in real Chromium: a worker whose module throws at load, and a `start` sent before it dies, must fail with the cause; the test fails on today's code. Then fail pending and later requests with a typed error, and let the app's engine-failure message read it. Proof: 100% coverage, the `browser.engine.worker` record kept, docs and a changeset.

## Questions for Will

None.
