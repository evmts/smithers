// Spend alerts' contract between the browser and ChatApi (docs/features/spend-alerts.md): the shape route, the table
// and the records the feature makes. Nothing here imports a library, so every side can.

/** `GET`: Electric's `spend_alerts`, only for an Admin; anyone else gets a shape with no rows. */
export const SPEND_ALERTS_SHAPE_ROUTE = "/api/shapes/spend-alerts"

/** The Postgres table: one row per alert. */
export const SPEND_ALERTS_TABLE = "spend_alerts"

/** The columns a device syncs: all of them but `audience`, which the shape filters on. */
export const SPEND_ALERT_COLUMNS = [
  "id",
  "kind",
  "window_start",
  "window_end",
  "calls",
  "tokens",
  "cost_usd",
  "roles",
  "day_tokens",
  "budget",
  "created_at",
] as const

/**
 * What spend alerts record in the browser, by name, and the attributes they carry (docs/observability.md#spend-alerts):
 * each alert an Admin's tab shows, and each one hidden. None carries anything anyone asked. src/telemetry.ts merges
 * them into what ChatApi's relay keeps.
 */
export const SPEND_TELEMETRY = {
  records: [
    "spend.alert.shown",
    "spend.alert.hidden",
    "smithers_web_spend_alerts_shown",
    "smithers_web_spend_alerts_hidden",
  ],
  fields: ["alertId", "calls", "tokens"],
} as const
