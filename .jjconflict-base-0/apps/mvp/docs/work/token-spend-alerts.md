---
title: Token-spend alerts
status: todo
area: infra
owner: unassigned
updated: 2026-10-20
links: [repo-follow-ups.md, ../todo.md, sandbox-budgets.md, ../observability.md, ../decisions/0008-auth.md, code-storage-spend-caps.md, decisions-for-will.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, sandboxes.md]
---

## What

- A tokens-per-minute and per-hour metric, by model, from ChatApi's answer records.
- An alert that reaches Will. While there are no users, any use at all alerts.
- A documented way to act: lower the budget, block a network, or pause asking.

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

## Next

Pick the alert channel, then wire the metric and alert through Alchemy so it deploys with the app. A public deploy should wait for it.

## Questions for Will

- Where should the alert reach you: Telegram, email or something else? The answer also routes the Code Storage budget alerts.
