---
title: Token-spend alerts
status: in-progress
area: infra
owner: spend alert channels builder (Claude Opus)
updated: 2026-10-20
links: [repo-follow-ups.md, ../todo.md, sandbox-budgets.md, ../observability.md, ../decisions/0008-auth.md, code-storage-spend-caps.md, decisions-for-will.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, sandboxes.md, notifications-and-live-work.md, dev-stack-hygiene.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-20, 22:15 PDT

**What:** Deliver configurable model-spend alerts in the app, by email and by Telegram through durable channel steps.

**Why:** Will requested configurable email and Telegram destinations.

**Current state:** At 22:08 the lead reports channel code handed to the lander but no passing end-to-end test. Broken lockfile, dev build failure and the test pause prevented proof; built code does not establish working delivery.

**Next step:** Resume real delivery tests after the landing test pause lifts; retain channel receipts, failure/recovery proof and configuration checks.

**Open questions for Will:** Provide a Resend account/API key for email and personally enter the Telegram chat ID in Settings. These are later setup items, not urgent burn-down decisions; never record key values here.

Evidence: script-filtered user-typed text and lead text replies from session 6253ecf2, approximately 20:15–22:15 PDT; synthetic notifications, relayed agents and compaction summaries excluded. Rulings and all 75 queue answers (latest 19:38 PDT) take precedence over historical shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution ownership and status retained; Codex tracker curator reconciles documentation only. Product results are reported evidence; this pass validates the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:00 PDT

**What:** Alert Admins on any model spend, at most once per 15-minute window, in the app and by email and Telegram.

**Why:** AUTH-4 requires alerts while there are no users. Will, 2026-10-20, to "Where should spend alerts reach you?": "configurable but atm i think alerts to email make sense but telegram too would be useful".

**Current state:** Channels built ([spend-alerts.md](../features/spend-alerts.md#channels)): `@smthrs/notifications` `Channels` (Resend email, Telegram Bot API), an Admin's Settings with email addresses and a Telegram chat (`alert/channel`, `POST /api/alert-channels`, migration `0029_alert_channels`), and `ops/DeliverSpendAlert`, one durable step per channel with an `alert_deliveries` receipt. Deployments need `ALERT_EMAIL_API_KEY` and `ALERT_TELEGRAM_BOT_TOKEN`.

**Next step:** Set the two keys on the deployment and an Admin's address and chat in Settings; deliver the Code Storage alert through the same channels.

**Open questions for Will:** none.

## Current specification — 2026-10-20, 18:33 PDT

**What:** Alert Admins on model spend with configurable email and Telegram delivery as well as the in-app feed.

**Why:** Will answered the destination question at 18:24: configurable, with email now and Telegram useful.

**Current state:** At 18:25 the lead assigned durable external delivery in the general notifications library and a check for reuse of the old ops-vault Telegram bot. No delivery receipt or complete browser proof is reported. The old destination question is answered.

**Next step:** Build configurable channels and destinations using durable delivery steps with deduplication and receipts; verify actual delivery, missing credentials, failure/recovery and in-app alerts. Retain server-flow-only spend and threshold follow-ups.

**Open questions for Will:** None now; report a concrete missing key or bot only if discovered.

Evidence: script-filtered last two hours of session 6253ecf2 through 18:32 PDT; queue answers through 18:30 PDT; current rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Queue answers supersede older open questions. Product receipts are reported evidence; this tracker validates only the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 15:10 PDT

**What:** Alert Admins on any model spend, at most once per configured 15-minute window.

**Why:** AUTH-4 requires alerts while there are no users.

**Current state:** The lead reported built code at 14:54 with 100% coverage; browser proof and recording still wait on stack recovery. todo.md confirms thresholds and server-flow-only windows are unfinished. Production defaults to alerts on; dev disables them. This remains in progress until real browser evidence exists.

**Next step:** Run the browser journey after stack recovery with alerts deliberately enabled in its test environment, record it, then retain follow-ups for server-only spend, growing-usage thresholds and external delivery.

**Open questions for Will:** Where should alerts reach Will outside the app: email, Telegram or another destination?

Evidence: recent user text and lead replies from session `6253ecf2`, extracted through 15:10 PDT; [rulings](../rulings.md) and queue answers through 14:36 PDT. Reported completion is distinguished from a test run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Alert Admins on any model spend, batched to at most one alert per 15 minutes.

**Why:** There are no users yet; unexpected spend needs attention.

**Current state:** At 14:54 the lead reports built code and 100% test coverage, showing tokens/cost by role in an Admin toast. Browser proof and recording still wait on the dev server. This is not a threshold-only alert.

**Next step:** Run the browser test after stack recovery and record it. Retain server-flow-only spend and later thresholds as follow-ups.

**Open questions for Will:** Where should alerts reach Will outside the app: email, Telegram or another destination?

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: spend alerts builder (Claude Opus), started 13:22:59 on 2026-10-20, rebriefed by the lead at 13:30 to alert on any spend; code on disk 13:33 to 13:41; unreported by 13:46. Until 13:46: spend alerts builder (Claude Opus), started by the lead at 13:22:59 on 2026-10-20; unreported by 13:24. Until 13:22: unassigned


## What

- A tokens-per-minute and per-hour metric, by model, from ChatApi's answer records.
- An alert that reaches Will. While there are no users, any use at all alerts.
- A documented way to act: lower the budget, block a network, or pause asking.

From 13:22 on 2026-10-20, the builder's slice (best guess from its brief):

- **Metrics:** tokens and estimated cost per role and per model, exported through the app's OTLP observability path, with no content.
- **Thresholds:** for example 50%, 80% and 100% of the day's budget, plus any spend by a signed-out caller if that path exists. Each fires once per threshold per day, as a durable flow. (Superseded at 13:30 on 2026-10-20: any spend alerts, batched; see below.)
- **Delivery:** to Admins through the in-app path that exists today. If 0009's feed isn't built, the alert is recorded durably where the feed will read it and shown to Admins on the shared toast stack ([notifications](notifications-and-live-work.md)).
- **Code Storage spend:** included if `@smthrs/effect-code-storage` exposes usage; otherwise a listed follow-up.

From 13:30 on 2026-10-20 (the lead's correction, Will's 2026-10-19 rule): **any model spend alerts**, batched to at most one alert every 15 minutes. On disk by 13:41: each admitted call makes sure its window's `ops/SpendAlert` flow has started (`worker/ModelSpend.ts`, window `MODEL_SPEND_ALERT_WINDOW`, default 15 minutes); at the window's end the flow claims the window's `model_usage` rows in one transaction and writes one `spend_alerts` row (calls, tokens and estimated cost by role, and today's tokens against the daily budget), which Admins' devices sync and show in the toast stack (`worker/flows/SpendAlert.ts`, migration `0019_spend_alerts`). It runs remotely because it must happen with every device off. Records carry roles, model ids, token counts and dollars, never what anyone asked.

## Why

Will first wanted signed-out asking guarded by alerts "if we notice a lot of token spend happening". He later required sign-in to ask, and the alerts stay. On thresholds: "anybody using the app at all shoujld alert me because we have 0 users we will configure it as we grow". Decision 0008 §11 records it.

## State

- Open boxes in `todo.md`; the any-use threshold is recorded there. Not started.
- ChatApi already logs input and output tokens per answer, so Workers Logs can sum them. There is no metric exporter or alert channel yet.
- 21:50 on 2026-10-19: a second spend alert joins this one. [Code Storage spend caps](code-storage-spend-caps.md) alert Will at 50%, 80% and 100% of the monthly Code Storage budget, and its design puts them beside this alert. One channel answer serves both.

- By 22:02: decision 0006's "Capacity and spend" section routes the Code Storage alerts through this item's flow, `ops/alert`, sending with `@smthrs/notifications` `Alerts.layerWebhook`, keyed once per month and threshold. So the alert flow serves both; the channel is still open.
- 22:31: decision 0011 routes every model call through the server's metered [model endpoint](model-endpoint.md). Once the browser agent answers, the token metric reads from the endpoint instead of ChatApi's answer records.

- 22:43: design question 8 (0005 Q3) proposes a third alert: sandbox spend at $100 a month, beside this one ([sandboxes](sandboxes.md)). The channel answer would serve all three.
- 22:45: Will deferred the sandbox limits, including that alert, until we ship ([sandbox budgets](sandbox-budgets.md)). This alert and the Code Storage alerts are unaffected.
- 22:59: W5 (a) adds the metering this alert reads: a `smithers_model_tokens` counter per role and model, with no ids or content in attributes, and a deployment-wide budget checked before each call, as Config for now ([model endpoint](model-endpoint.md)). The alert and where it reaches Will are still open.

- 23:15 to 23:25: **the metering is on disk**, unreported ([model endpoint](model-endpoint.md)): a `model_usage` row per served call with input and output tokens by role and model, and a metric with the same attributes. The budget is daily: a call is refused with 429 `quota_exceeded` once today's rows reach it. The alert and its channel are still open.

- 23:39: **the metric is done, reported** with the [model endpoint](model-endpoint.md): every served call writes a `model_usage` row and `smithers_model_tokens` by `role`, `model` and `type`; `MODEL_DAILY_TOKEN_BUDGET` refuses with 429 past the daily budget. `todo.md` ticks the metric box. The alert to Will and its channel are still open.

- By 02:35 on 2026-10-20: the Code Storage half writes its alert line. `worker/RepoMetrics.ts` logs `repo.spend.alert` and counts `repo_spend_alerts` once a month per threshold, and says delivery "is the token-spend alert's channel (docs/todo.md), which reads this line". Delivery is a [repo follow-up](repo-follow-ups.md); the channel is still open.
- 13:08 to 13:13 on 2026-10-20: the local dev server hit its 1,000,000-token daily budget, about half of it reservations from killed test runs; the lead raised the local cap to 10,000,000 in `apps/mvp/.env` ([dev stack hygiene](dev-stack-hygiene.md)). Production's cap is unchanged. An alert at 80% would have named the cause before the e2e runs failed.
- 13:19:52: the lead's list puts "Roles and labels; token-spend alerts" under "Your feature list, not started yet".
- 13:21:12: the lead: it can start now, "small, server side only".
- **13:21:41: Will: "start the ones that can start now we are trying to ship faster".**
- **13:22:59: the lead started the spend alerts builder** (Claude Opus) on scratchpad `final/BUILD-COMMON.md`. Today `worker/ModelUsage.ts` reserves and settles each call against `model_budget_days`, and `worker/ModelEndpoint.ts` refuses at `MODEL_DAILY_TOKEN_BUDGET`; the builder keeps changes there minimal and tested and doesn't touch `ModelProxy.ts`, which the keep-alive fix just changed ([model endpoint](model-endpoint.md)).
- 13:23:33, the lead to Will: "spend metrics, and alerts at 50%, 80% and 100% of the day's budget, for Admins".
- **Status moved from todo to in-progress.**
- Gap to check in the report: Will's rule (2026-10-19, `todo.md`) is that any use alerts while there are no users. The 13:22 brief covers percentage thresholds and signed-out spend, not a first-use alert.
- **13:30:49 on 2026-10-20, the lead to Will:** "The tracker also caught my mistake in the spend-alert brief. You asked for an alert on any model spend while there are no users, and I had briefed thresholds at 50%, 80% and 100% of the budget. I told that agent to alert on any spend, batched to at most one alert every 15 minutes." The gap this note flagged at 13:27 is closed in the brief.
- On disk, unreported: `db/migrations/0019_spend_alerts.ts` (13:33:10), `worker/flows/SpendAlert.ts` `ops/SpendAlert` (13:38:37) and its test, `worker/ModelSpend.ts` (13:39:09), `worker/SpendAlerts.ts` (13:41:27), with `ModelEndpoint.ts`, `ModelRoles.ts` and `ChatApi.ts` changed.
- The builder's state, uncommitted ([spend alerts](../features/spend-alerts.md)):
  - Metrics: `smithers_model_spend_tokens` and `smithers_model_spend_usd` by role and model, and a `model.spend` line, for every metered call, a server flow's own included. Cost is `Pricing.cost` from `@smthrs/model`.
  - The alert: each admitted call starts its window's `ops/SpendAlert`, one execution per window. Once the window ends it claims the ledger's uncarried calls (`model_usage.spend_alert_id`) and records one `spend_alerts` row with calls, tokens and estimated cost by role, and today's tokens against the budget.
  - Delivery: `GET /api/shapes/spend-alerts` syncs alerts to Admins only. An Admin's tab shows each one as a toast in the shell's one stack (`src/screens/app/Toasts.tsx`, shared with the [notifications](notifications-and-live-work.md) feed), with Hide kept per device.
  - Settings: `MODEL_SPEND_ALERTS`, which `alchemy dev` defaults to off (`worker/DevChatApi.ts`), and `MODEL_SPEND_ALERT_WINDOW`, 15 minutes. A test proves production's default is on.
  - Not built, each a box in `todo.md`: budget thresholds as alerts of their own (each alert carries today's tokens and the budget), an alert started by a server flow's own calls (the next alert carries them), Code Storage delivery (`@smthrs/effect-code-storage` reports no usage), and a channel outside the app.
  - No end-to-end test: the shared dev server runs with alerts off, as the 13:30 correction asked.
- 14:12 to 14:15 on 2026-10-20: [`features/spend-alerts.md`](../features/spend-alerts.md) (14:12) and [`todo.md`](../todo.md) (14:15) tick "An alert that reaches Will on any model spend at all … at most once per `MODEL_SPEND_ALERT_WINDOW` (15 minutes) … Built and tested". `todo.md` keeps open: the outside channel, thresholds, a window with only server-flow spend, blocking a network or pausing asking, and Code Storage delivery.
- 14:15 to 14:17 on 2026-10-20: the session usage limit stopped the spend alerts builder with 12 others; the lead resumed all 13 at 14:19.
- 14:26: `0019_spend_alerts` applied to the shared dev database. 14:07:58: the curator moved "Where should spend alerts reach you?" down the queue, since in-app delivery no longer blocks (priority 640 at 14:30). No builder report by 14:30.

## Next

From 14:30 on 2026-10-20: the builder's report: the any-spend alert in the app with its tests, and the boxes left open in `todo.md`. Outside delivery (Telegram, email) still needs Will's channel answer, a queue question. A public deploy should wait for this.

Until 14:30 on 2026-10-20 the next step was, from 13:30 on 2026-10-20: the builder's report: an alert on any spend, at most one per 15 minutes, delivered to Admins in the app; its metric; tests that fail on the old code; and the Code Storage half. Outside delivery (Telegram, email) still needs Will's channel answer. A public deploy should wait for this.

Until 13:46 on 2026-10-20 the next step was, from 13:22 on 2026-10-20: the builder's report: the metrics and their attributes, the alert flow and its once-per-day keys, delivery to Admins, and the Code Storage half. Then check that an any-use alert exists, per Will's rule. Outside delivery (Telegram, email) still needs Will's channel answer; until then alerts reach Admins in the app only. A public deploy should wait for this.

Until 13:22 on 2026-10-20 the next step was: pick the alert channel, then wire the metric and alert through Alchemy so it deploys with the app. A public deploy should wait for it.

## Questions for Will

- Answered about 18:40 on 2026-10-20: email and Telegram, configurable. Built as Settings' alert channels.
