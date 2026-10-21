import { ShapeProxy } from "@smthrs/effect-electric"
import { Effect, Metric, Option } from "effect"
import { LOCAL_ELECTRIC_URL } from "../src/features/chat/contract.ts"
import { SPEND_ALERT_COLUMNS, SPEND_ALERTS_TABLE } from "../src/features/spend/contract.ts"
import * as ShapeAccess from "./ShapeAccess.ts"

// Spend alerts in ChatApi (docs/features/spend-alerts.md): Electric's `spend_alerts` shape, which only an Admin's
// devices sync. `ops/SpendAlert` (worker/flows/SpendAlert.ts) writes the rows; nothing else does.

/** `GET /api/shapes/spend-alerts` requests, by `status` and `live`. */
export const shapes = Metric.counter("smithers_spend_alert_shape_requests", {
  description: "GET /api/shapes/spend-alerts requests, by status and live",
  incremental: true,
})

/** The audience an Admin reads. */
const ADMINS = "admin"

/** No audience: what anyone else's shape filters on, so it holds no rows. */
const NOBODY = ""

/**
 * Reads Electric's connection (`ShapeProxy.config`) and returns `GET /api/shapes/spend-alerts`: every alert for a
 * person with the Admin role; signed out, or any other role, a shape with no rows; sessions unreadable, 503
 * (worker/ShapeAccess.ts). Each request is a `spend.alerts.shape` line and a count.
 */
export const make = Effect.gen(function* () {
  const connection = yield* ShapeProxy.config({ url: LOCAL_ELECTRIC_URL })
  return ShapeProxy.make({
    ...connection,
    shape: Effect.map(ShapeAccess.actor, (actor) => ({
      table: SPEND_ALERTS_TABLE,
      where: "audience = $1",
      params: {
        "1": Option.isSome(actor) && actor.value.role === "admin" && actor.value.act === undefined ? ADMINS : NOBODY,
      },
      columns: [...SPEND_ALERT_COLUMNS],
    })),
    name: "spend.alerts.shape",
    metric: shapes,
  })
})
