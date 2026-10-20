---
title: The metered model endpoint and admin model roles
status: done
area: app
owner: none; done again at 13:18:35 on 2026-10-20, when the keep-alive agent reported; lands with round 3 of [land to main](land-to-main.md). Until 13:18: keep-alive agent; changeset `model-proxy-keep-alive` written 13:03:14 and `worker/ModelEndpoint.ts` changed 13:15:06 on 2026-10-20; unreported by 13:17. Until 13:03: keep-alive agent, started by the lead about 12:52 on 2026-10-20: the server must forward the provider's keep-alives through `ModelProxy` to the browser; unreported by 12:59. Until 12:52: none; done again at 12:31:22 on 2026-10-20, when review round 4's worker fix agent reported R4-1, R4-14, R4-17 and R4-26 fixed; `admin/SetModel` (P3) is the [P3 cleanup](review-round-4-p3-cleanup.md)'s. Until 12:31: review round 4's worker fix agent (from about 10:53 on 2026-10-20): R4-1, unknown usage refunds the reservation (P1, reproduced); its tests on disk at 11:06 also cover Opus's R4-14, a negative thinking budget. Unrouted by 11:07: R4-17, reservations that never settle, and `admin/SetModel` as dead code (P3). Until 10:53: none; done again at 07:01:52 on 2026-10-20, when the worker Fable fix agent reported Fable review 2's P2-2 fixed. Until 07:01: Fable fix agent: worker (since 06:09:12 on 2026-10-20): Fable review 2's P2-2, the read-then-run budget race (reproduced: 8 concurrent calls spent 368 of a 46-token budget), plus a bound on input size. Until 06:09: fix agent for Codex Astra review 3's findings 1 and 4 (assigned by 01:19 on 2026-10-20): a server-minted accounting id in `ModelProxy` and `ModelUsage` (reported fixed about 02:16 on 2026-10-20); the wiring agent adds the Member gate (since about 01:17); reopened 01:18 by finding 1 (P1, reproduced); built by the W5 (a)+(c) agent (started 22:59, reported done 23:39 on 2026-10-19); W5 (a) of durable answering
updated: 2026-10-20
links: [review-round-4.md, dev-stack-hygiene.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0008-auth.md, ../decisions/0007-roles-and-tags.md, durable-answering.md, durable-browser-engine.md, model-step.md, sdk-cleanup.md, sign-in.md, token-spend-alerts.md, agent-ui-rendering.md, agent-evals.md, cloudflare-flow-host.md, code-reviews.md, flows-and-agent.md, ../features/model-endpoint.md, sdk-test-reds.md, app-wiring.md, roles-and-labels.md, land-and-deploy-mvp.md, fable-review-2-fixes.md, land-to-main.md, cerebras-rate-limits.md]
---

## What

Every model call goes through one server endpoint on Cloudflare. The endpoint:
- holds the model key, so the browser never does;
- checks sign-in, since signed-out people can't ask ([0008](../decisions/0008-auth.md) §11), and the budget;
- resolves a named role (`agent`, `renderer` or `judge`) to a model, from an admin setting in Postgres that falls back to the deploy's `Config` default, so changing a model needs no deploy;
- meters tokens for [token-spend alerts](token-spend-alerts.md).

An admin changes a role's model with one flow, `admin/SetModel { role, model }`, from the CLI or an admin view. The change is audited and takes effect on the next call. Only a person with the admin role ([0007](../decisions/0007-roles-and-tags.md)) may run it, never an agent.

In the browser each call is a durable [`ModelStep`](model-step.md) on the [durable browser engine](durable-browser-engine.md). A crash mid-call re-runs that one call on resume, and a sealed result is never fetched again.

## Why

Will, 22:29 on 2026-10-19: "All model calls are proxied through server yea that's the entire reason we set it up that way plus it allows us to quicklly and easiuly change that."

Will, 22:34, on the renderer's model: "Yea you got it same model but make it super easy to configure by us as admins".

## State

- Decided in [0011](../decisions/0011-the-agent-runs-in-the-browser.md) §3 (22:31) and [0004](../decisions/0004-agent-ui-codemode-and-rendering.md) question 2 (22:34). Not built.
- The starting point is `ModelProxy`, added to `@smthrs/model` in commit `fadb89048fc8`, which the [SDK cleanup](sdk-cleanup.md) later deleted as unused.
- Today `worker/ChatApi.ts` calls the model itself inside `waitUntil`. There is no endpoint, no role setting and no `admin/SetModel`.
- 22:31: the lead corrected an earlier claim. The endpoint doesn't answer a retried call from a cache; a call interrupted by a crash runs again on resume, as on any host.

- 22:42: the lead's 0011 docs agent writes this item into `HOST-PLAN.md`'s "Revised by 0011" section as W5 (a): restore `ModelProxy` from `fadb89048fc8`; roles `agent`, `renderer` and `judge`, each an admin setting in Postgres changed by the `admin/SetModel` flow and falling back to `Config`; the sign-in check (0008) and the budget; token metering for the spend alert ([durable answering](durable-answering.md)). Not yet written at 22:46.
- 22:43: design question 8 (0005 Q3) proposes the sandbox limits as admin settings changeable without a deploy, "like the model setting" ([sandboxes](sandboxes.md)).
- 22:45: Will deferred the sandbox limits until we ship ([sandbox budgets](sandbox-budgets.md)); `admin/SetModel` is still the only admin setting planned now.
- 22:48: 0007 Q1 answered with four roles. **Admin** holds admin settings such as models and budgets, so `admin/SetModel` stays Admin-only ([roles and labels](roles-and-labels.md)).
- 22:49: **W5 (a) is written** in `HOST-PLAN.md`'s "Revised by 0011" section, as described at 22:42. 0003's build plan cites it as the agent's model path ([flows and the agent](flows-and-agent.md)). Not built.
- 22:54: the lead corrected one detail in the docs: the endpoint is restored from the commit that added `ModelProxy`, `fadb89048fc8`, not from the commit that deleted it. HOST-PLAN and 0011 now cite `fadb89048fc8` as the commit that added it.
- 22:58: W1 finished, so the engine API this needs is final ([durable answering](durable-answering.md)).
- 22:59: **W5 (a) started**, in one agent with (c), the [Cloudflare flow host](cloudflare-flow-host.md). Its brief:
  - restore `ModelProxy` from `fadb89048fc8` into `@smthrs/model` (`packages/smithers/agent/model`), generic with no app names; it serves a `Model` over HTTP and streams from one as a `Model`;
  - mount it in `ChatApi` at a route such as `POST /api/model`;
  - roles `agent`, `renderer` and `judge` resolve from an admin setting row in Postgres (a new migration), falling back to `HostModel` Config;
  - an `admin/SetModel` flow (`Flow.make`) writes the setting and an audit row; only an Admin may run it, never an agent;
  - **a sign-in seam:** an injected `Actor` or session service. Production has no provider yet, so the endpoint refuses every call with a typed 401 until sign-in lands; local dev and tests get a dev actor by dependency injection, never through a production code path;
  - a deployment-wide budget, as Config for now, checked before each call; a `smithers_model_tokens` counter per role and model, with no ids or content in attributes;
  - errors carry codes, never provider text;
  - tests on compose Postgres with the provider as the only scripted seam: signed-out refused, a role change applies on the next call, an agent can't run `admin/SetModel`, over budget refused, telemetry never carries prompt or key text.
- 23:07: nothing on disk yet in `packages/smithers/agent/model` or `apps/mvp/worker`.
- 23:12 to 23:15, on disk, unreported:
  - `packages/smithers/agent/model/src/ModelProxy.ts` restored, with `test/ModelProxyDocs.test.ts`, a new guide `docs/guides/proxy-a-model.md`, and `docs/api.md`, `docs/README.md`, `README.md` and `CHANGELOG.md` updated;
  - `packages/smithers/agent/model-host/src/HostModel.ts`, its `index.ts` and `HostModel.test.ts` changed;
  - `apps/mvp/worker/ChatApi.ts` changed at 23:14. No migration for the role setting yet: `apps/mvp/db/migrations` still ends at `0003_paired_positions.ts`.
- **`pnpm docs:check` is temporarily red** on a stale `apps/server/src/docsRedirectMap.ts`, caused by the new `proxy-a-model.md` guide. W5 will run `pnpm docs:sync`.

- 23:15 to 23:25, on disk, unreported (W5 is still writing):
  - **Migration `db/migrations/0004_model_roles.ts`** (23:15): `model_roles` (one row per role, checked to `agent`, `renderer` or `judge`), `model_role_changes` (the audit, one row per step by its invocation key) and `model_usage` (tokens per served call; the budget sums today's rows). `db/Database.ts` and its test changed with it.
  - **The sign-in seam, `worker/Actor.ts`:** a `Sessions` service whose production layer, `signedOut`, resolves nobody, so every ask is refused until [sign-in](sign-in.md) supplies a layer; `CurrentActor` for flow steps; the four roles of 0007.
  - New `worker/ModelEndpoint.ts`, `ModelRoles.ts`, `ModelUsage.ts`, `SetModel.ts` and `ErrorCode.ts`; `Chat.ts` and `ChatApi.ts` changed; the shared contract `src/features/model/contract.ts` (route `/api/model`, the three roles).
  - **`worker/ModelEndpoint.test.ts`, 15 cases**, among them: a signed-out call gets 401 and never reaches a model; a role change by `admin/SetModel` applies on the next call with no deploy; the change is audited once per step; an agent acting for an admin is refused (`delegated`), and so is a member (`not_admin`); 429 `quota_exceeded` once today's spend reaches the budget, and yesterday's spend doesn't count; telemetry never carries the prompt, the answer, the provider's error text or the key. Also `SetModel.test.ts` and `ErrorCode.test.ts`.
  - `@smthrs/model`: `test/ModelProxy.test.ts` (23:22) covers the NDJSON wire, typed failures, body limits and multibyte text split across chunks; `ModelProxy.ts`, its guide and `docs/api.md` changed again at 23:22.
  - `apps/server/src/docsRedirectMap.ts` was regenerated at 23:19, so `pnpm docs:sync` ran; no result of `pnpm docs:check` is on record.
  - Not yet on disk: a `docs/libraries.md` row for `ModelProxy`, and `docs/features/model-endpoint.md`, which the new code's comments already cite.

- 23:24 to 23:36, on disk, unreported:
  - **`docs/features/model-endpoint.md` exists** (23:28, again 23:36). The route is `POST /api/model/<role>` on ChatApi, served by `ModelProxy.serve`. `prepare` refuses a signed-out caller (401 `authentication`), a bad request (400 `invalid_request`), a spent budget (429 `quota_exceeded`) and a role model that can't be used (503 `no_route`); `onEnd` writes `model_usage` before the terminal line. Production provides `Actor.signedOut`; only tests provide an actor.
  - `docs/libraries.md` has `ModelProxy` rows: a job row, "Serve a model over HTTP so a browser calls it without the key, and meter it", and the `@smthrs/model` package row ([library catalog](library-catalog.md)).
  - `worker/ModelEndpoint.ts`, its test, `ErrorCode.test.ts` and `SetModel.test.ts` changed again (23:24 to 23:28). `docs/observability.md` (23:28), `docs/rules.md` and `apps/mvp/PACKAGE.ts` (23:35) and `apps/mvp/AGENTS.md` (23:36) changed. `docs/todo.md` now points its sign-in and token-metric items at the feature doc.
- 23:33: the lead lists W5 (a)+(c) as still running.

- 23:39: **done, reported** (W5 (a)+(c), one agent; the (c) half is the [Cloudflare flow host](cloudflare-flow-host.md)):
  - `ModelProxy` is restored into `@smthrs/model`. `prepare` returns the request plus the model and its `attributes`, and `onEnd` meters the call. `HostModel.make(record)` exists in `@smthrs/model-host`.
  - `POST /api/model/<role>` resolves the caller through an injected `Sessions` service. Production refuses everyone with 401 until [sign-in](sign-in.md) supplies a layer.
  - `MODEL_DAILY_TOKEN_BUDGET` refuses with 429 once today's `model_usage` rows reach it. A role's model comes from the `model_roles` table, falling back to `CHAT_MODEL`. Both tables come from migration `0004_model_roles`.
  - `admin/SetModel` writes the setting plus an audit row. Only an Admin may run it, never an agent. `worker/DevChatApi.ts` provides a local Admin in dev only.
  - 152 tests pass, and the production plan passes. New docs: `docs/features/model-endpoint.md` and `docs/features/remote-flows.md`.
  - Open items: `db:migrate` doesn't apply the engine's own migrations, which run on the first alarm; the worker tsconfigs gained the DOM lib.
- 23:39: the lead told Will: "signed-out calls are refused, and each model role can be switched by an admin"; "a daily token budget is enforced, and every call is metered." With the endpoint's Worker file free, it started S1, [sign-in](sign-in.md) phase 1, which replaces the production `signedOut` layer.
- 23:41: F5 started the browser agent. Every model call it makes goes through `ModelStep` to this endpoint's `agent` role ([flows and the agent](flows-and-agent.md)).

- 00:24 on 2026-10-20: F1 found `@smthrs/agent`'s `Fault.sweep` test failing on `ModelProxyRefusal`, the error type W5 added with the restored `ModelProxy`. The [SDK test reds](sdk-test-reds.md) agent decides whether the agent retries it, against `ModelStep`'s capacity rules, and fixes the sweep.
- 00:25: F4+F5's throwaway test drove one call through the endpoint's `agent` role: `model.proxy.stream` succeeded with status 200 ([flows and the agent](flows-and-agent.md)).
- About 00:55 on 2026-10-20: `ModelProxyRefusal` is classified like `ModelError`: a 429 or 402 waits, a 5xx is a dependency failure, a 401 or `out_of_credit` goes to a person, a 400 is a factory failure ([SDK test reds](sdk-test-reds.md)).
- About 01:00: [sign-in](sign-in.md) is built, so the endpoint can tell signed-in callers apart. A gap went to the lead's checklist: the endpoint must require Member or above (0007); today any signed-in person, Guests included, can ask ([app wiring](app-wiring.md)).

- 01:17:57 on 2026-10-20: **Codex Astra review 3's finding 1 (P1, reproduced) reopens this item** ([code reviews](code-reviews.md)). The budget can be bypassed:
  - `ModelProxy.serve` (`packages/smithers/agent/model/src/ModelProxy.ts:333`) takes `x-smithers-request-id` from the caller, runs the provider on every request, and passes that id to `onEnd`.
  - `ModelUsage.record` (`apps/mvp/worker/ModelUsage.ts:28` to `:30`) uses it as the primary key with `ON CONFLICT DO NOTHING`.
  - So a signed-in caller who resends one id spends tokens on every call, but only the first counts toward `spentToday`, and the daily budget never fills. No concurrency or guessing is needed.
  - Codex reproduced it through the real `ModelProxy.serve` with two requests carrying one id: the model ran twice and both `onEnd` reports carried `requestId: "same"`. It didn't run the database insert.
  - Codex's fix: a server-owned accounting id for each provider call, separate from the client's correlation id, or real durable idempotency before the provider runs. Test: two calls with one header book both costs, unless the second replays the first's result.
  - Status moved from done to todo: a reproduced P1 with no fix yet. [Token-spend alerts](token-spend-alerts.md) depend on this metering.

- About 01:16 on 2026-10-20: F4+F5's report includes an SDK fix here. `ModelProxy.serve` refused every agent call after the first frame, because the first frame's `responseId` was `null`. Every model call the browser agent makes is now a sealed `ModelStep` through `/api/model/agent` ([flows and the agent](flows-and-agent.md)).
- About 01:17: the wiring agent started. It adds the Member gate: the endpoint refuses a Guest, per 0007 ([app wiring](app-wiring.md)).
- By 01:19: **finding 1 is accepted and assigned** to one fix agent, together with finding 4 ([sign-in](sign-in.md)): the server mints its own accounting id for every provider call, in `ModelProxy` and `ModelUsage` ([code reviews](code-reviews.md)). Status moved from todo to in-progress.
- 01:27, on disk: `worker/Actor.ts` defines who may ask: `ASKERS` is Admin, Maintainer and Member (`repo:ask`, 0007 §2), so a Guest is refused. `Actor.test.ts` changed with it. Best guess the wiring agent's Member gate.
- As of 01:44: `worker/ModelUsage.ts` (23:16 on 2026-10-19) and `ModelProxy.ts` (00:55) are unchanged; the accounting fix isn't on disk yet.

- 01:45 to 01:49 on 2026-10-20, on disk, unreported: **finding 1's fix.**
  - **`@smthrs/model`:** `ModelProxy.serve` mints an `invocationId` for every call it admits and passes it to `onEnd` beside the caller's `requestId`. The server span carries it as `smithers.model.proxy.invocation_id`, and the log line as `invocationId` (`ModelProxy.ts` 01:45; changeset `model-proxy-invocation-id.md`; `docs/api.md` and `guides/proxy-a-model.md`). New test: "mints its own invocation id for every served call, even when callers repeat a request id".
  - **The app:** `model_usage` is keyed by `invocation_id`; `request_id` is kept only to correlate the row with the caller's records, since a caller may repeat it (`worker/ModelUsage.ts`, 01:47). The table changed inside `db/migrations/0004_model_roles.ts` (01:47), not in a new migration; nothing is deployed yet ([land and deploy](land-and-deploy-mvp.md)). New test in `worker/ModelEndpoint.test.ts` (01:49): "calls that repeat one request id each book what they spent, against the budget".
  - Not yet: the fix agent's report, or proof that the test fails on the old code.

- **About 02:16 on 2026-10-20: finding 1 is fixed, reported** by the fix agent for findings 1 and 4 ([code reviews](code-reviews.md)):
  - `ModelProxy.serve` mints its own `invocationId` for every call it accepts and passes it to `onEnd` beside the caller's `requestId`. `model_usage` is keyed on `invocation_id`; `request_id` is a plain column, and `ON CONFLICT DO NOTHING` is gone.
  - `0004_model_roles` was edited in place, since it never ran outside test schemas: the local dev database is at 0003 and there is no prod stage ([land and deploy](land-and-deploy-mvp.md)).
  - **Fails on the old code:** the SDK test sends two calls with one id and gets two invocation ids. The compose Postgres test sends three calls with one id and gets 200, 200, 429 with two booked rows; before the fix the third call returned 200.
  - **Proof:** `@smthrs/model` 1,010 tests at 100% coverage, lint passes; `apps/mvp` typecheck clean, the touched files at 100% over 102 tests; `pnpm docs:sync` and `smthrs docs //packages/smithers/agent/model:docs` pass. `pnpm docs:check` didn't run in full: its Go price check refused to start at 4.7 GiB free ([dev stack hygiene](dev-stack-hygiene.md)).
  - The agent's full worker and db run had 5 failures, all in other agents' files. The mvp `importRules` target still fails on two other agents' files (a `setTimeout` in a debug test, a deep import in `RepoPage.tsx`).
- The lead to Will: "every model call now gets a server-made ID and is booked. Three calls sharing one client ID now return 200, 200, then 429 over budget; before the fix the third went through."
- **The Member gate is on disk with tests:** `worker/Actor.ts` (01:27) lets only Admin, Maintainer and Member ask; `Actor.test.ts` "Member and above may ask; a Guest and a person with no role may not", and `ModelEndpoint.test.ts` refuses "a Guest". It is the wiring agent's, not yet reported ([app wiring](app-wiring.md)).
- 02:22 to 02:23, scratchpad `full5.txt`: a full `apps/mvp` run fails `ModelEndpoint.test.ts` "a setting the Worker can't use is refused with 503 no_route" with Postgres `too many clients already`, a shared-stack limit, not this code ([dev stack hygiene](dev-stack-hygiene.md)).
- **Status moved from in-progress to done** at the lead's ruling (about 02:24): finding 1 is fixed with a test that fails on the old code. The Fable review of review 3's fixes is tracked in [code reviews](code-reviews.md), and the Member gate's report in [app wiring](app-wiring.md).
- **06:08 on 2026-10-20: reopened by Fable review 2's P2-2, reproduced.** `worker/ModelEndpoint.ts:84-89` reads `spentToday` before the model runs, and `onEnd` (`:114-138`) records spend after the stream, so concurrent calls all pass the check. With a 46-token budget, 8 concurrent calls of 46 tokens all returned 200 and `model_usage` summed to 368; the next sequential call got 429. `ModelEndpoint.make` passes no `maxBodyBytes`, so `ModelProxy.serve` admits up to 1 MiB, about 250k input tokens a call. Fable's fix: one Postgres statement reserves the call's maximum before it runs and refuses at the budget; `onEnd` replaces the reservation with actual usage; `maxBodyBytes` of about 64 KiB. Regression: 8 concurrent calls against a budget of 46 admit exactly one. **Status moved from done to in-progress** ([Fable review 2 fixes](fable-review-2-fixes.md)).
- 06:09:12 on 2026-10-20: the worker fix agent started, told to reserve atomically and reconcile under the server-minted `invocationId`, pass `maxBodyBytes` and cap prompt tokens, with the concurrent test first.
- 06:14 to 06:15 on 2026-10-20, on disk, unreported: `packages/smithers/agent/model/src/ModelProxy.ts` (06:14:58) documents an admission that "a host that bounds spend reserves ... keyed by `invocationId`" (`:257`, `:312`), and `test/ModelProxy.test.ts` adds `maxBodyBytes` cases. `worker/ModelEndpoint.ts` is unchanged since 01:47.
- 06:19 to 06:23 on 2026-10-20, on disk, unreported: the reservation.
  - Migration `0012_model_reservations.ts` (06:21:27): "each call reserves its worst case before the model runs and settles to what it spent when it ends, and the day's total is one counter row, `model_budget_days`, which a reservation checks and raises in one statement". `model_usage` gains `day`, `reserved_tokens` and `settled_at`; rows from before it count as settled.
  - `worker/ModelUsage.ts` (06:22:35) and `worker/ModelEndpoint.ts` (06:23:04). The worst case is the body's bytes, each counted as a prompt token, plus the output and thinking caps. "The reservation is the last step, so no refusal after it leaves one behind." Bodies over 192 KiB (`MODEL_MAX_REQUEST_BYTES`) are refused.
  - `worker/ModelEndpoint.test.ts` (06:19:01) adds "concurrent calls can't overshoot: against a budget of 46, eight at once admit exactly one" and "a body over MODEL_MAX_REQUEST_BYTES is 413 and never reaches a model or the budget". No run on record.
- **07:01:52 on 2026-10-20: P2-2 fixed, reported** by the worker fix agent ([Fable review 2 fixes](fable-review-2-fixes.md)). "Each call reserves its worst case in one atomic statement before the model runs and settles to actual usage in `onEnd`, keyed by `invocationId`" (migration `0012_model_reservations`). `ModelProxy.serve` now gives `prepare` a second argument, `Admission`, carrying the ids and the request size (changeset `model-proxy-prepare-admission.md`). 8 concurrent calls against a 46-token budget admit exactly one. The request cap defaults to 192 KiB, not Fable's 64 KiB, "because the agent's long requests reach about 128 KiB". The 185 tests on the touched worker and db files pass, at 100% coverage. Nothing is committed.
- 07:02:06 on 2026-10-20, the lead to Will: "Budget race: each call reserves its worst-case cost atomically, so 8 calls at once against a tiny budget let exactly 1 through. Requests are capped at 192 KiB."
- **Status moved from in-progress to done**: nothing else here is open.

- **10:50 to 10:52 on 2026-10-20: reopened by [review round 4](review-round-4.md)'s R4-1 (P1), found by Codex Sol and Codex Astra, reproduced by both.** `worker/ModelEndpoint.ts:138-143` treats missing input and output usage as zero and settles the reservation whatever `end.outcome` says (`ModelUsage.ts:56-73`). A stream that emits paid output and is then cancelled or fails before its final usage event refunds its whole reservation, so a caller can disconnect after the text and repeat without touching the budget. Astra ran the real `ModelEndpoint.make` → `ModelProxy.serve` handler on compose Postgres: each ledger row had `reserved_tokens = 149`, `input_tokens = 0`, `output_tokens = 0`, `settled = true`, and the daily counter was **0**. Sol reproduced the proxy half in memory (`outcome: "interrupted", usage: {}`). The existing cancellation test (`ModelEndpoint.test.ts:577`) emits usage before cancelling, so it misses this. Fix: unknown usage is never zero; keep or charge the reservation unless complete usage arrives. **Status moved from done to in-progress.**
- **10:53:16, the lead to Will:** "If a model call is cancelled or fails after output but before its usage report, the whole cost is refunded. Repeating that spends tokens without touching the budget." The fix ("charge the reservation when usage is unknown") went to a new worker fix agent, test first.
- **11:04:02, Claude Opus (round 4), two more here.** R4-14 (P2, reproduced): `thinkingBudget = Math.min(request.params.thinkingBudget, maxOutputTokens)` keeps a negative value, so `{ maxTokens: 8000, thinkingBudget: -8000 }` reserves only the prompt's bytes while the OpenAI-shaped body still sends `max_tokens: 8000`. On ChatApi's real handler with a 20,000 budget, 8 concurrent honest calls admitted 3 (committed 24,300); with the negative knob all 8 were admitted (committed 64,800). Fix: non-negative integer knobs in `@smthrs/model`, clamped in `prepare`. R4-17 (P2, also Fable P3-4): a reservation whose call never reaches `onEnd` (isolate eviction, CPU limit) counts until midnight UTC; about 212k tokens each, so five lock every Member out of the 1,000,000 default. Fix: count an unsettled reservation only within the longest call's duration, in the same statement. And Fable P3-2 with Opus P3-6: `admin/SetModel` is imported only by tests, no host registers it and no route starts it, while `features/model-endpoint.md:56` and `jev.md:28` present it as live; once wired, an Admin could point `CEREBRAS_API_KEY` at any `https:` origin. Fix: wire it with each key pinned to its provider's origin, or delete it and the two doc paragraphs.
- 11:02 to 11:06 on 2026-10-20, on disk, unreported: the worker fix agent's change. `worker/ModelUsage.ts` (11:02:29): "`undefined` for a count it never reported, which is unknown, never zero". `ModelEndpoint.test.ts` (11:06:12) adds "a call whose client goes away after its text, before usage, keeps its whole reservation", "a call that fails after its text, before usage, keeps its whole reservation", "a call that fails after partial or complete usage keeps its reservation, or what it reported when more", "calls cancelled after their text, before usage, spend the budget until they are refused", and R4-14's "concurrent calls with a negative thinking budget can't pass the budget: they never run". No run on record.
- **12:31:22 on 2026-10-20: the worker fix agent reported** "All four findings and the four later ones are fixed, each with a test that failed before the fix"; nothing is committed. Here:
  - R4-1: a call whose usage is unknown keeps its whole reservation; only a call that ends normally with both token counts settles down.
  - R4-14: negative, zero or fractional `maxTokens` or `thinkingBudget` get a 400.
  - R4-17: migration `0017_model_charges` adds `charged_tokens` and `expires_at`. A reservation that never settles stays charged in full until the day ends; after its expiry a late settle changes nothing (`expired`, a `model.usage` warning); no sweep. Opus's proposed fix (count it only within the longest call's duration) wasn't taken.
  - R4-26: `ModelProxy`'s `onEnd` always runs to completion (changeset `model-proxy-onend-uninterruptible`). The caller-loss test also passes on the old build, so it guards regressions only.
  - 100% coverage on touched files; `docs:sync`, `docs:check` and `smthrs docs` for the model package pass.
- **Status moved from in-progress to done**: no P1 or P2 here is open. `admin/SetModel` (dead code, P3) and the meter guide's unclamped `maxTokens` (Fable S-P3-11) wait for the [P3 cleanup](review-round-4-p3-cleanup.md).
- **12:52:09 on 2026-10-20: a gap left by [review round 4](review-round-4.md)'s SDK batch 2** (R4-29, [ModelStep](model-step.md)). `ModelStep` now counts every chunk, keep-alives included, as a heartbeat, with silence and call bounds set by reasoning effort (`high`: 300 s of silence; `xhigh` and `max`: no silence bound, a 1,800 s call). But the server doesn't forward the provider's keep-alive signals through `ModelProxy`, so a long reasoning call made from the browser can time out while the provider is still working. The batch 2 agent left it because "that file belongs to the worker-fix agent".
- 12:52:41, the lead to Will: "the server doesn't pass the model provider's keep-alive signals on to the browser. Without them, a long reasoning call made from the browser can time out even though the provider is still working. I've started an agent to fix that."
- **Status moved from done to in-progress.**
- **13:03:14 on 2026-10-20, on disk, unreported: changeset `.changeset/model-proxy-keep-alive.md`** (`@smthrs/model`, minor): "`ModelProxy` carries a provider's keep-alives to the client. `serve` writes a blank NDJSON line each time the served model runs `Model.Liveness`, at most one a second and none within a second of an event, and the client runs `Model.Liveness` for every chunk of the body it reads." A silent provider still sends nothing and still times out; older clients already skip blank lines. 13:11:53: `@smthrs/model`'s suite passed, 1,018 tests at 100% coverage (scratchpad `model-suite.txt`). 13:15:06: `worker/ModelEndpoint.ts` changed. No report by 13:17.
- **13:08 to 13:13 on 2026-10-20: the endpoint's daily budget stopped the local dev server's model calls** ([dev stack hygiene](dev-stack-hygiene.md)): 1,022,891 committed against the 1,000,000 cap, about half of it reservations from killed test runs. That is the budget working as designed (`worker/ModelUsage.ts`: a call reserves its worst case; a reservation that never settles stays charged and is final once it expires). The lead raised the local cap to 10,000,000 (`apps/mvp/.env`, not committed); production's cap is unchanged. Its 429 reads like a provider's, which made the e2e failures look like [Cerebras rate limits](cerebras-rate-limits.md).

- **13:18:35 on 2026-10-20: the keep-alive fix is done, reported.** The lead to Will: "The server now passes the model provider's keep-alives on to the browser, so a long reasoning call made from the browser no longer times out while the provider is working. A provider that sends nothing still times out." Each new test failed on the old code; `@smthrs/model` passes 1,018 tests at 100% coverage; docs checks pass. SDK only: `packages/smithers/agent/model/src/ModelProxy.ts`, tests in model and agent, docs, changeset `model-proxy-keep-alive.md` (scratchpad `final/WIRING.md`, 13:20). "It lands on `main` in the next commit round."
- Still to verify: that nothing between the deployed Worker and the browser holds back the 1-byte keep-alive chunks. The lead checks it at the first deploy ([land and deploy](land-and-deploy-mvp.md)).
- 13:19:52: the lead's post-agents list no longer names the endpoint. **Status moved from in-progress to done.**
- 13:22:59: the [token-spend alerts](token-spend-alerts.md) builder reads `worker/ModelUsage.ts` and `worker/ModelEndpoint.ts` with minimal, tested edits, and doesn't touch `ModelProxy.ts`.

## Next

From 13:18 on 2026-10-20: nothing here. The keep-alive fix lands with the SDK files in round 3 ([land to main](land-to-main.md)); at the first deploy, check that keep-alives reach the browser unbuffered. Whether a killed run's reservation should settle sooner is not on record as a decision; nothing changes without one.

Until 13:18 on 2026-10-20 the next step was, from 13:03 on 2026-10-20: the keep-alive agent's report, with the endpoint test that fails on the old code (a silent `high` call through `/api/model/<role>` outlives the browser's silence bound); then this item is done again. Whether a killed run's reservation should settle sooner is not on record as a decision; nothing changes without one.

Until 13:03 on 2026-10-20 the next step was, from 12:52 on 2026-10-20: the keep-alive agent's report: `ModelProxy.serve`, and so `/api/model/<role>`, forwards the provider's keep-alives, with a test that fails on the old code (a silent high-effort call through the endpoint outlives the browser's silence bound). Then this item is done again. R4-21 (flows stranded across a deploy) stays the SDK fix agent's ([plan identity across deploys](plan-identity-across-deploys.md)).

Until 12:52 on 2026-10-20 the next step was, from 12:31 on 2026-10-20: nothing here. The fixes land with round 3 of [land to main](land-to-main.md); R4-21 (flows stranded across a deploy) is the SDK fix agent's ([plan identity across deploys](plan-identity-across-deploys.md)).

Until 12:31 on 2026-10-20 the next step was, from 10:53 on 2026-10-20: the worker fix agent's report on R4-1 (and R4-14), each with a test that fails on the old code: a call cancelled or failed after its text and before usage keeps its reservation, and repeated cancelled calls are eventually refused. Then the lead's ruling on R4-17 and on wiring or deleting `admin/SetModel` ([review round 4](review-round-4.md)). Then this item is done again.

Until 10:53 on 2026-10-20 the next step was, from 07:01 on 2026-10-20: nothing here. The reservation lands on `main` with the rest ([land to main](land-to-main.md)); the spend alert is [token-spend alerts](token-spend-alerts.md).

Until 07:01 on 2026-10-20 the next step was, from 06:09 on 2026-10-20: the worker fix agent's report ([Fable review 2 fixes](fable-review-2-fixes.md)): an atomic reservation before each provider call, reconciled when the call ends under its `invocationId`; bounded input; and the test of 8 concurrent calls against a 46-token budget admitting exactly one. Then this item is done again.

Until 06:09 on 2026-10-20 the next step was, from about 02:24 on 2026-10-20: nothing here. The Fable review covers this fix with the rest of review 3 ([code reviews](code-reviews.md)), and the wiring agent reports the Member gate ([app wiring](app-wiring.md)). Rerun `ModelEndpoint.test.ts` once the compose Postgres allows more connections ([dev stack hygiene](dev-stack-hygiene.md)).

Until about 02:24 on 2026-10-20 the next step was, from 01:19: the fix agent's report. Proof: a server-owned accounting id for each provider call, separate from the client's `x-smithers-request-id`, and a test that fails on today's code: two calls carrying one header book both costs, unless the second replays the first's result. Also the wiring agent's Member gate, with a test that a Guest is refused. Then the Fable review ([code reviews](code-reviews.md)), and this item is done again.

Until about 01:19 on 2026-10-20 the next step was: the lead fixes or rejects review 3's finding 1, the request-id budget bypass, test first ([code reviews](code-reviews.md)). Then this item is done again.

Nothing here. [Sign-in](sign-in.md) (S1, running since 23:39) supplies the production `Sessions` layer, and F5's browser agent calls the `agent` role through `ModelStep` ([flows and the agent](flows-and-agent.md)). The spend alert is [token-spend alerts](token-spend-alerts.md). The two open items, the engine's migrations and the DOM lib in the worker tsconfigs, are tracked on the [Cloudflare flow host](cloudflare-flow-host.md).

(By 23:36 `docs/features/model-endpoint.md` and the catalog's `ModelProxy` rows exist.)

Until 23:39 the next step was: W5's report, with the tests above passing at 100% coverage and the docs updated (`docs/libraries.md`, the chat feature doc or a new `docs/features/model-endpoint.md`, `docs/observability.md`). Then [sign-in](sign-in.md) supplies the production `Actor`, and the browser agent calls the endpoint through `ModelStep`.

Until 22:59 the next step was: restore the endpoint from `fadb89048fc8` with the sign-in check, the budget, the role lookup and token metering. Then add `admin/SetModel` with an audit row. Tests: a signed-out call is refused; a role change applies on the next call with no deploy; an agent can't run `admin/SetModel`.

## Questions for Will

- Does `ModelProxy` come back in `@smthrs/model` or live only in the app's `worker/`? Recommended: `@smthrs/model`, under "extend the SDK, never hand-roll in the app". Building proceeds on the recommendation. (22:59: W5 restores it into `@smthrs/model`.) (Done 23:39: `ModelProxy` is in `@smthrs/model`.)
- None open.
