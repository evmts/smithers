import { Action, Flow, Interpreter, RetryPolicy, Sleep } from "@smthrs/flow"
import { Pricing } from "@smthrs/model"
import { Node } from "@smthrs/plan"
import { Clock, Effect, Layer, Metric, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { codeOf } from "../ErrorCode.ts"

// `ops/SpendAlert { from, until, budget }` (docs/features/spend-alerts.md): one alert to the deployment's Admins about
// the model spend of one window. Will, 2026-10-19: any model spend at all alerts, because there are no users yet. The
// model endpoint starts this flow when it admits a call, one execution per window (`executionId`), so a burst of calls
// starts it once. It waits on a durable timer until the window ends, then, in one transaction, claims every ledger row
// (`model_usage`) made before the window's end that no alert has carried yet, and records one `spend_alerts` row: their
// calls, tokens and estimated cost by role, and today's tokens against the daily budget. Admins' devices sync that row
// and show it in the toast stack. A window whose calls an earlier alert already carried records nothing.
//
// It runs remotely because it must happen while every device is off (`devices-off`, `flows.local-first-placement` in
// docs/rules.md). It runs on any host; the host injects Postgres through `registration`.

const nonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const positive = Schema.Int.check(Schema.isGreaterThan(0))

/** One window: its start and end in epoch milliseconds, and the daily token budget the alert reports against. */
const payload = { from: nonNegative, until: positive, budget: positive }

/** A window, as the flow's payload holds it. */
export interface Window {
  readonly from: number
  readonly until: number
  readonly budget: number
}

/**
 * The execution, and the alert, for one window: one per window length and start, so every call in a window starts
 * the same execution, and a new window length after a deploy never collides with an old one.
 */
export const executionId = (window: Pick<Window, "from" | "until">) =>
  `spend-alert-${window.until - window.from}-${window.from}`

/** One role's spend in an alert: its calls, the tokens they were charged and their estimated cost, `null` unpriced. */
export const RoleSpend = Schema.Struct({
  role: Schema.String,
  calls: Schema.Number,
  tokens: Schema.Number,
  costUsd: Schema.NullOr(Schema.Number),
})
export type RoleSpend = typeof RoleSpend.Type

/**
 * What the alert step did: recorded the window's alert, found it recorded already (a step that ran again), or found
 * nothing to carry. `calls`, `tokens` and `costUsd` are the alert's.
 */
const Alerted = Schema.Struct({
  outcome: Schema.Literals(["recorded", "existing", "none"]),
  calls: Schema.Number,
  tokens: Schema.Number,
  costUsd: Schema.NullOr(Schema.Number),
})
type Alerted = typeof Alerted.Type

/** Postgres failed. The step retries it, and never gives up: an alert must not be lost. */
export class AlertFailed extends Schema.TaggedError<AlertFailed>()("@smthrs/mvp/ops/AlertFailed", {
  reason: Schema.Literal("database"),
}) {}

/**
 * Spend alerts, by `outcome`: `recorded`, `existing`, `none`, `failed` for one failed step, and `not_started` when the
 * model endpoint couldn't start a window's alert (worker/ModelSpend.ts).
 */
export const alerts = Metric.counter("smithers_model_spend_alerts", {
  description: "Model spend alerts, by outcome",
  incremental: true,
})

/** Only Postgres can fail the alert step, so its retries never give up. */
const retryPolicy = RetryPolicy.make({ initialMs: 1_000, factor: 2, maxMs: 60_000 })

/**
 * How long until the window ends, in milliseconds, on the host's clock; 0 once it has. Sealed, so a resume keeps it.
 */
export const AlertIn = Action.make("ops/SpendAlertIn", {
  payload,
  success: Schema.Number,
  tier: "sealed",
})

/** Claims the window's calls and records its alert. */
export const Record = Action.make("ops/RecordSpendAlert", {
  payload,
  success: Alerted,
  error: AlertFailed,
  capabilities: ["db:write:model_usage", "db:write:spend_alerts"],
  retryPolicy,
})

/** `ops/SpendAlert`: once a window ends, alerts the Admins about the model spend no alert has carried yet. */
export const SpendAlert = Flow.make("ops/SpendAlert", {
  description: "Once a window ends, alert the deployment's Admins about its model spend: tokens and cost by role.",
  capabilities: ["db:write:model_usage", "db:write:spend_alerts"],
  modelInvocable: false,
  payload,
  success: Alerted,
  error: Schema.Union([AlertFailed, Sleep.SleepRequestInvalid]),
  body: Node.capture({}, (window: Window) =>
    AlertIn.call(window).pipe(
      Node.bindPlanned(Node.capture({}, (millis) => Sleep.action.call({ millis }))),
      Node.andThen(Record.call(window)),
    )),
})

/** How long until `until`, in milliseconds, on the host's clock. */
export const alertIn = (window: Pick<Window, "until">) =>
  Effect.map(Clock.currentTimeMillis, (now) => Math.max(0, window.until - now))

/** A role and model's calls in a claim, as Postgres sums them. */
interface Claimed {
  readonly role: string
  readonly modelId: string
  readonly calls: number
  readonly input: number
  readonly output: number
  readonly charged: number
}

/**
 * The estimated cost of a role and model's calls, `null` for a model no rate card prices. A call's charge beyond what
 * the model reported (its reservation, kept while its usage is unknown) is priced as output, the dearer kind.
 */
export const estimate = (claimed: Pick<Claimed, "modelId" | "input" | "output" | "charged">) => {
  const cost = Pricing.cost(
    { inputTokens: claimed.input, outputTokens: Math.max(claimed.output, claimed.charged - claimed.input) },
    claimed.modelId,
  )
  return cost === undefined ? null : cost.costUsd
}

/** Sums each role's calls, tokens and cost; a role with any unpriced model has no cost. */
const byRole = (claimed: ReadonlyArray<Claimed>): ReadonlyArray<RoleSpend> => {
  const roles = new Map<string, RoleSpend>()
  for (const row of claimed) {
    const cost = estimate(row)
    const sum = roles.get(row.role) ?? { role: row.role, calls: 0, tokens: 0, costUsd: 0 }
    roles.set(row.role, {
      role: row.role,
      calls: sum.calls + row.calls,
      tokens: sum.tokens + row.charged,
      costUsd: sum.costUsd === null || cost === null ? null : sum.costUsd + cost,
    })
  }
  return [...roles.values()]
}

/**
 * Records `window`'s alert against the `SqlClient` in context, in one transaction: claims every ledger row made before
 * the window's end that no alert carried, sums them by role, and writes the alert. Run again after it recorded, it
 * returns the recorded alert and claims nothing.
 */
export const record = (window: Window) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const id = executionId(window)
    return yield* sql.withTransaction(Effect.gen(function* () {
      const [existing] = yield* sql<
        { readonly calls: number; readonly tokens: number; readonly costUsd: number | null }
      >`
        SELECT calls, tokens::float8 AS tokens, cost_usd AS "costUsd" FROM spend_alerts WHERE id = ${id}`
      if (existing !== undefined) return { outcome: "existing", ...existing } satisfies Alerted
      const claimed = yield* sql<Claimed>`
        WITH claimed AS (
          UPDATE model_usage SET spend_alert_id = ${id}
          WHERE spend_alert_id IS NULL AND created_at < to_timestamp(${window.until} / 1000.0)
          RETURNING role, model_id, input_tokens, output_tokens, charged_tokens
        )
        SELECT role, model_id AS "modelId", count(*)::int AS calls, sum(input_tokens)::float8 AS input,
          sum(output_tokens)::float8 AS output, sum(charged_tokens)::float8 AS charged
        FROM claimed GROUP BY role, model_id ORDER BY role, model_id`
      if (claimed.length === 0) return { outcome: "none", calls: 0, tokens: 0, costUsd: null } satisfies Alerted
      const roles = byRole(claimed)
      const calls = roles.reduce((sum, role) => sum + role.calls, 0)
      const tokens = roles.reduce((sum, role) => sum + role.tokens, 0)
      const costUsd = roles.reduce<number | null>(
        (sum, role) => (sum === null || role.costUsd === null ? null : sum + role.costUsd),
        0,
      )
      const [today] = yield* sql<{ readonly committed: number }>`
        SELECT committed::float8 AS committed FROM model_budget_days WHERE day = (now() AT TIME ZONE 'UTC')::date`
      yield* sql`
        INSERT INTO spend_alerts (id, window_start, window_end, calls, tokens, cost_usd, roles, day_tokens, budget)
        VALUES (${id}, to_timestamp(${window.from} / 1000.0), to_timestamp(${window.until} / 1000.0), ${calls},
          ${tokens}, ${costUsd}, ${JSON.stringify(roles)}::jsonb, ${today?.committed ?? 0}, ${window.budget})`
      return { outcome: "recorded", calls, tokens, costUsd } satisfies Alerted
    }))
  })

/**
 * The alert step over `database`, with its records: a `model.spend.alert` log line and span, Warn when it recorded an
 * alert or an attempt failed, and `smithers_model_spend_alerts`. They carry counts, tokens and dollars, never what
 * anyone asked.
 */
export const observedRecord = <E, R>(window: Window, database: Layer.Layer<SqlClient.SqlClient, E, R>) => {
  const id = executionId(window)
  return record(window).pipe(
    Effect.provide(database),
    Effect.tapError((error) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(alerts, { outcome: "failed" }), 1),
        Effect.logWarning("model.spend.alert").pipe(
          Effect.annotateLogs({ alertId: id, outcome: "failed", errorCode: codeOf(error) }),
        ),
      )
    ),
    Effect.mapError(() => new AlertFailed({ reason: "database" })),
    Effect.tap((alerted) =>
      Effect.andThen(
        Metric.update(Metric.withAttributes(alerts, { outcome: alerted.outcome }), 1),
        Effect.logWithLevel(alerted.outcome === "recorded" ? "Warn" : "Info")("model.spend.alert").pipe(
          Effect.annotateLogs({
            alertId: id,
            outcome: alerted.outcome,
            calls: alerted.calls,
            tokens: alerted.tokens,
            ...(alerted.costUsd === null ? {} : { costUsd: alerted.costUsd }),
          }),
        ),
      )
    ),
    Effect.withSpan("model.spend.alert", { attributes: { "smithers.spend_alert.id": id } }),
  )
}

/** Registers `ops/SpendAlert` with its steps, reaching Postgres through `database`. */
export const registration = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Interpreter.layerWithImplementations(
    SpendAlert,
    Layer.merge(
      AlertIn.toLayer((window) => alertIn(window)),
      Record.toLayer((window) => observedRecord(window, database)),
    ),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
