# Spend alerts

Any model spend alerts the deployment's Admins, at most once a window. Will, 2026-10-19: "anybody using the app at all shoujld alert me because we have 0 users we will configure it as we grow" ([decision 0008](../decisions/0008-auth.md) §11, question 3). The alert carries the window's tokens and estimated cost by role, and today's tokens against the daily budget.

## How it works

```
POST /api/model/<role> ── admitted ──▶ start `ops/SpendAlert` for this window (once per window per isolate)
                                             │ one execution per window: spend-alert-<window ms>-<window start ms>
                                             ▼
FlowExecution (Durable Object) ── sleep until the window ends ── claim the ledger's uncarried calls, record one alert
                                                                             │ spend_alerts row, audience admin
GET /api/shapes/spend-alerts ◀── Electric ◀──────────────────────────────────┘
  └─▶ an Admin's devices ──▶ a toast in the shell's stack: "Model spend · agent · 12,340 tokens · $0.02"
```

1. **Start.** When the model endpoint admits a call (its budget reservation succeeded), it starts its window's `ops/SpendAlert` through `FlowStarter` (`worker/ModelSpend.ts`). Windows are `MODEL_SPEND_ALERT_WINDOW` long, laid end to end from the epoch, so every call in a window starts the same execution, and starting it again is a no-op. Each isolate remembers the window it last started, so a burst costs one start per isolate. A start the host refuses is logged and counted (`not_started`), and the next call starts it again; the call itself goes on. A refused call (`401`, `403`, `429`) spends nothing and starts nothing.
2. **Wait.** The flow sleeps on a durable timer until the window ends (`ops/SpendAlertIn`, sealed, on the host's clock).
3. **Record.** `ops/RecordSpendAlert`, in one transaction, claims every `model_usage` row made before the window's end that no alert has carried (`spend_alert_id`), and records one `spend_alerts` row with their calls, tokens charged, and estimated cost, in total and by role, plus today's committed tokens and the budget. A call still running counts at its reservation. A window whose calls an earlier alert carried records nothing (`none`). Run again, the step returns the alert it recorded and claims nothing more. Postgres failing fails the step, which retries without giving up.
4. **Deliver.** `GET /api/shapes/spend-alerts` syncs every alert to a person with the Admin role and to nobody else: a Member, a Guest, an agent acting for an Admin and a signed-out request get a shape with no rows. An Admin's tab shows each alert it hasn't hidden as a toast, newest first, after the feed's toasts in the shell's one stack (`src/screens/app/Toasts.tsx`). Hide marks that alert and every earlier one seen on that device, kept through a reload; a later alert still shows.

Cost is `Pricing.cost` from `@smthrs/model`: the rate card of the call's model, or the provider's own charge when it reported one. A call's charge beyond what the model reported (a reservation it kept because its usage is unknown) is priced as output, the dearer kind. A model the rate card doesn't price has no cost, and neither has its role or the alert; its tokens still count.

The alert is a durable record, not a page. Decision 0009's feed can route each row to Admins' notifications once it carries a spend kind ([notifications](notifications.md)); until then the row and its toast are the delivery.

## What each call records

Every call the endpoint meters, and every call a server flow makes through `ModelEndpoint.local`, records what the model reported: `smithers_model_spend_tokens` and `smithers_model_spend_usd`, by `role` and `model`, and a `model.spend` line ([observability.md](../observability.md#spend-alerts)). A call that reported no tokens and no cost records nothing.

## Settings

| Variable | Default | |
|---|---|---|
| `MODEL_SPEND_ALERTS` | on | a boolean (`true`, `false`, `on`, `off`, …): whether any spend alerts. `alchemy dev` defaults it to off (`worker/DevChatApi.ts`), because a laptop's runs and the end-to-end tests spend all day; setting it turns them back on |
| `MODEL_SPEND_ALERT_WINDOW` | `15 minutes` | a duration of at least a second: one alert per window at most |

A deploy reads both when ChatApi starts. A deploy that sets nothing alerts. Each deploy, and the dev database, needs migration `0019_spend_alerts` (`pnpm db:migrate`) before the shape can sync.

## Acting on an alert

- **Lower the budget:** set `MODEL_DAILY_TOKEN_BUDGET` and deploy ([model endpoint](model-endpoint.md#configuration)). Once today's committed tokens reach it, every call is refused `429 quota_exceeded`.
- **Use a cheaper model:** `admin/SetModel` changes a role's model on the next call ([model endpoint](model-endpoint.md#roles)).
- **Stop asking:** sign-in decides who may ask; a person without the Member role can't ([sign-in](sign-in.md)).

Blocking a network and pausing asking without a deploy are not built ([todo.md](../todo.md#alerts-on-token-spend)).

## Not built

- **Server flows' own calls start no alert.** Triage's calls (`ModelEndpoint.local`) are metered and charged, and the next alert carries them, but only a call through the endpoint starts a window's alert. A Durable Object host for `FlowStarter` would close it.
- **Budget thresholds** (50%, 80% and 100% of the day's budget) as alerts of their own. Each alert already carries today's tokens and the budget.
- **Code Storage spend.** `@smthrs/effect-code-storage` reports no usage (Code Storage has no usage API); the app meters it itself and logs `repo.spend.alert` ([repo.md](repo.md#spend)), which doesn't reach Admins yet.
- **A channel outside the app.** The alert reaches an Admin only in the app. Will hasn't said where else it should reach him ([token-spend alerts](../work/token-spend-alerts.md#questions-for-will)).

## Files

| File | What it holds |
|---|---|
| `worker/ModelSpend.ts` | the per-call records, the settings, the windows, and the start of a window's alert |
| `worker/flows/SpendAlert.ts` | `ops/SpendAlert`: the wait, the claim and the alert |
| `worker/SpendAlerts.ts` | `GET /api/shapes/spend-alerts`, Admins only |
| `worker/ModelEndpoint.ts` | calls `ModelSpend.record` when a call ends and the alert start when one is admitted |
| `db/migrations/0019_spend_alerts.ts` | `spend_alerts`, and `model_usage.spend_alert_id` |
| `src/features/spend/` | the browser: the synced alerts, the device's mark, the toasts and Hide |

## Postgres

| Table | Columns | |
|---|---|---|
| `spend_alerts` | `id` (key: the execution id), `kind` (`model`), `audience` (`admin`), `window_start`, `window_end`, `calls`, `tokens`, `cost_usd` (null when a model isn't priced), `roles` (jsonb: `role`, `calls`, `tokens`, `costUsd` each), `day_tokens`, `budget`, `created_at` | one row per alert; synced to Admins without `audience` |
| `model_usage.spend_alert_id` | the alert that carried the call; null until one did. Rows from before migration `0019` read `before_spend_alerts` | partial index on `created_at` where null |

## Tests

| Test | Proves |
|---|---|
| `worker/ModelSpend.test.ts` | each call's tokens and cost by role and model, a provider's own charge, an unpriced model, no usage; production's default is on and starts its window's alert once with the window and budget; a refused call starts nothing; the dev default is off, the setting turns it back on and off; the window setting; a start the host refuses or that dies is logged by code and retried by the next call, and one already started counts as started; the settings' bounds |
| `worker/flows/SpendAlert.test.ts` | on the Node host: waits for the window to end, then one alert with each role's calls, tokens and cost, carrying only uncarried calls from before the window's end; an unpriced model; a step run again; a window with nothing to carry; its records; Postgres failing |
| `worker/ExecutionHost.test.ts` "the deployed flows run ops/SpendAlert" | the deployed host's flows include it: a model call starts it, its alarms wait out the window, and it records the alert |
| `worker/SpendAlerts.test.ts` | a model call starts the alert, the flow records it, and the compose Electric syncs it to an Admin; a Member, an agent for an Admin and a signed-out request get no rows; sessions unreadable is 503 |
| `src/features/spend/spend.test.ts` | an Admin's tab shows alerts newest first, Hide marks earlier ones seen, kept through a reload, another device unaffected; a Member's tab syncs none; the toast's words |
| `db/Database.test.ts` "0019_spend_alerts" | earlier calls are marked carried; the table's bounds |
