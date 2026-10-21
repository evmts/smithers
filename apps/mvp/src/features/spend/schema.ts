import { Schema } from "effect"

// Spend alerts' rows (docs/features/spend-alerts.md): the `spend_alerts` row Electric delivers, and this device's mark
// of what an Admin has seen. A row stored on the device is read by the next version of the app too: change its shape
// only with its collection's `schemaVersion`.

/** One role's spend in an alert: its calls, the tokens they were charged and their estimated cost, `null` unpriced. */
export const RoleSpend = Schema.Struct({
  role: Schema.String,
  calls: Schema.Number,
  tokens: Schema.Number,
  costUsd: Schema.NullOr(Schema.Number),
})
export type RoleSpend = typeof RoleSpend.Type

/**
 * One row of Postgres `spend_alerts` as Electric delivers it: columns in camelCase, `bigint`s as numbers, `roles`
 * parsed. One alert carries the model spend of one window: calls, tokens charged, estimated cost (`null` when a model
 * isn't priced) by role, and today's tokens against the daily budget.
 */
export const SpendAlert = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("model"),
  windowStart: Schema.String,
  windowEnd: Schema.String,
  calls: Schema.Number,
  tokens: Schema.Number,
  costUsd: Schema.NullOr(Schema.Number),
  roles: Schema.Array(RoleSpend),
  dayTokens: Schema.Number,
  budget: Schema.Number,
  createdAt: Schema.String,
})
export type SpendAlert = typeof SpendAlert.Type

/**
 * What this device has seen, one row per alert kind: Hide on an alert marks it and every earlier one seen (`through`,
 * the hidden alert's `createdAt`), so only later alerts show.
 */
export const Seen = Schema.Struct({ kind: Schema.String, through: Schema.String })
export type Seen = typeof Seen.Type
