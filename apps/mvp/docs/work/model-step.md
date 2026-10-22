---
title: ModelStep, the durable model call
status: in-progress
area: sdk
owner: durable-effects builder assigned by lead; earlier implementation ownership retained in history
updated: 2026-10-21 22:43 PDT
links: [agent-jev.md, land-to-main.md, ../features/chat.md, ../rules.md, ../../../../docs/libraries.md, durable-answering.md, model-host-effect-boundary.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, durable-browser-engine.md, review-round-4.md, api-baseline-rerecord.md, agent-status.md, code-reviews.md]
---

## Tracker reconciliation — 2026-10-21 22:43 PDT

**What:** Keep model retries in the durable engine.

**Why:** Preserve attempts and usage across recovery.

**Current state:** At 22:36 the lead reports the change complete and handed to the lander: 914 flow tests and 2,114 agent tests pass with full coverage. A pre-existing agent failure has a separate queued fix. No landing receipt for this change yet.

**Next step:** Obtain landing and recovery receipts on the deployed revision.

**Open questions for Will:** None newly required.

Evidence: script-filtered recent human messages and lead text replies in 6253ecf2, through 22:43 PDT; the supplied continuation path is absent, with continuation-era text in the available session. Current rulings and queue answers prevail. Existing execution ownership retained; Codex curates this note. Reported product receipts were not rerun here. Wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:24 PDT

**What:** Keep model retries in the durable engine with stable identity and usage.

**Why:** Recovery must preserve attempts and prompt-cache behavior.

**Current state:** At 21:22 the retry change is rebased without conflicts onto current main. The flow suite passes 914/914 with full coverage; agent suite is rerunning and docs still await completion. A missing-package Latitude slot failed an earlier attempt and has its own runner repair.

**Next step:** Collect agent/docs checks, hand off the validated commit and obtain landing and recovery receipts.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies in the latest approximately two hours across both requested transcript paths; continuation path is absent, but continuation-era replies appear in 6253ecf2. Current rulings and queue answers prevail. Surviving briefs/reports used where cited; wiped scratch files are not missing work. Execution ownership retained; Codex curates this note. Product checks are reported receipts, not rerun here.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:10 PDT

**What:** Keep model retries in the durable engine.

**Why:** Recovery must retain attempt identity and usage.

**Current state:** Tests moved to Latitude after the MacBook lock delay. At 21:02 the lead reports 914/914 flow tests and full coverage; agent tests and docs still running.

**Next step:** Collect remaining checks, hand off and obtain landing/recovery receipts.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:34 PDT

**What:** Persist model-call retries through the durable engine.

**Why:** Recovery must retain attempts, usage and stable action identities.

**Current state:** At 20:30 the lead reports the retry change rebased onto main and running its full tests on the MacBook. Passing suites, the final commit and a landing receipt remain unreported. The earlier 19:00 pause is superseded by resumed work.

**Next step:** Collect the suite results, fix failures, commit and hand off to the lander; prove restart and failed-attempt accounting.

**Open questions for Will:** None.

Evidence: lead text replies script-filtered from session 6253ecf2, approximately 18:34–20:34 PDT, and recovered briefs where named. Automated notifications and tool content are excluded. Current rulings and queue answers prevail over older plans. Existing implementation ownership is retained; Codex curates the tracker. Product results are reported evidence, not tests rerun by this refresh.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 17:14 PDT

**What:** Persist model-call retry state in the durable engine.

**Why:** Recovery must preserve attempts, usage and step identities.

**Current state:** At 17:10 plan-core owns three replacement commits for durable-effects’ final commit. The old final commit is dropped; no replacement landing or completed full validation is reported.

**Next step:** Finish replacement checks after the 19:00 architecture pause, land and prove retry recovery.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies in session 6253ecf2, approximately 15:14–17:14 PDT. Notifications, relayed agents, tools and compaction summaries excluded. Rulings and queue answers supersede older briefs/designs and docs. Execution owner retained; Codex curates the tracker only. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:33 PDT

**What:** Move model-call retry state into the durable engine.

**Why:** Restart must preserve retry counts, failed-attempt usage and recorded-key replay.

**Current state:** At 16:26–16:29 PDT the model-call retry change is written but unproven: its full test run waits behind the lander’s MacBook test lock. The lead also assigns the plan-core builder the rebase of durable-effects’ final commit onto action-key versioning. No passing test or landing receipt for this last retry piece is reported.

**Next step:** Complete the queued suite, repair workspace state, commit and hand off to the lander; retain old-key replay and restart regressions.

**Open questions for Will:** None.

Evidence: lead text replies in session 6253ecf2, script-filtered through 16:33 PDT from its latest two hours; automated notifications, tool records and compaction summaries excluded. Rulings and queue answers take precedence over historical briefs. Implementation ownership retained; Codex curates tracker documentation. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:05 PDT

**What:** Keep model attempts and sealed results durable across restart and upgrades.

**Why:** DUR-2 requires engine-owned retry state; persisted history must remain replayable.

**Current state:** At 14:03 PDT code review confirms model retries outside the engine lose retry counts and failed-attempt token usage after restart. Changing the encoding of finished-step keys would also break replay of recorded results. Both findings go to the durable-effects builder. Reopened from done; no fix or landing receipt exists.

**Next step:** Repair retry/usage persistence and retain old-key replay compatibility with restart and recorded-history regressions; coordinate durable-external-effects.md.

**Open questions for Will:** None.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2 for approximately 12:04–14:04 PDT on 2026-10-21; synthetic notifications and tool records excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates the maintainer-site build only. Engineering owners remain responsible; Codex owns this documentation reconciliation.

## Earlier tracker history (retained)


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
- **07:49:53 on 2026-10-20: `ModelStep.model` added** by the [Jev](agent-jev.md) agent. It turns a model and its route into a `Model` whose every call is one sealed `ModelStep.run` of the running flow, so code that takes a `Model` and calls it itself, such as `Evaluator.layerFromSeat`, judges with sealed, replayable calls instead of streaming the seat directly. Tests, docs, a row in `docs/libraries.md` and the changeset `.changeset/model-step-as-model.md` (minor). Its first consumer is `app/jev/classify` and `app/jev/evaluate`. Uncommitted; it lands in round 2 of [land to main](land-to-main.md). Status stays done.
- **12:52:09 on 2026-10-20: [review round 4](review-round-4.md)'s R4-28 and R4-29 fixed** by the SDK batch 2 agent, each with a test that failed on the old code; uncommitted (changeset `model-step-engine-retries-reasoning-bounds`, major).
  - **Retries (R4-28):** `retryPolicy` is the only retry and waits the provider's `Retry-After`. A new `RequestExecutor.Retries`, set to 0 by `ModelStep`, stops the route's HTTP layer retrying within an attempt. A failing call now sends 3 requests where it sent 18 (scripted provider), and 2 where it sent 6 (real HTTP 503). `defaultRetryPolicy` is at most 6 attempts with no 2-minute window, because that window, counted from the first attempt, blocked any retry of a long call.
  - **Liveness (R4-29):** every chunk, keep-alives included, is a heartbeat (`Model.Liveness`). `run` takes `callTimeoutMs`, and `heartbeatTimeoutMsFor` and `callTimeoutMsFor` set both bounds by effort: `none`, `minimal` and `low` allow 60 s of silence and a 300 s call; unset and `medium` 300 s and 300 s; `high` 300 s and 900 s; `xhigh` and `max` no silence bound and 1,800 s. A call past its timeout is sealed `call_timeout` and not retried. `defaultHeartbeatTimeoutMs` is removed.
  - The agent suite passes 2,084 tests at 100% coverage. Keep-alives don't reach the browser through `ModelProxy` yet ([model endpoint](model-endpoint.md)). Status stays done.
- **12:57:25 on 2026-10-20, a replay gap found by [agent status](agent-status.md):** reopening a tab while the agent waits on a question makes one extra model call. The lead: "A saved model step should replay without calling the model again, so it goes into the next review round" ([code reviews](code-reviews.md)). No test reproduces it yet. Status stays done until the review rates it.
- **13:04:55: landed on `main`** in round 2 as `1000ecda62` "✨ feat(agent): ModelStep.model makes a model call one sealed step; ModelProxy admits a call before it runs", with the changesets `model-step-as-model` and `model-proxy-prepare-admission` ([land to main](land-to-main.md)). The 12:52 R4 fixes (changeset `model-step-engine-retries-reasoning-bounds`) aren't in it.

## Next

From 13:04 on 2026-10-20: the R4 fixes land in the lander's next round; the next review round takes the extra model call on a reopened tab ([agent status](agent-status.md)). Keep-alive forwarding stays the [model endpoint](model-endpoint.md)'s; the major changeset joins the [API baseline](api-baseline-rerecord.md) re-record.

Until 13:04 on 2026-10-20 the next step was, from 12:52 on 2026-10-20: nothing here. The major changeset joins the [API baseline](api-baseline-rerecord.md) re-record; keep-alive forwarding is the [model endpoint](model-endpoint.md)'s; the fixes land in round 3 of [land to main](land-to-main.md).

Until 12:52 on 2026-10-20 this section read:

Done. Follow-ups that belong to other items:
- The coverage gap and snapshot: [model-host Effect boundary](model-host-effect-boundary.md). (Closed 22:47.)
- The engine asks: W1 in [durable answering](durable-answering.md).
- First consumer: W5 makes `chat/Answer` call `ModelStep`, with the caching tests (one call when killed after the seal, zero on a rerun of a settled answer). (Changed 22:31 by decision 0011: the first consumer is the browser agent, with the same caching tests.)
- A `ModelStep` row in `docs/libraries.md` ([library catalog](library-catalog.md)): added about 22:00 by the lead (job row, `@smthrs/agent` row, "Which to pick").

## Questions for Will

None.
