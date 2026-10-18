import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import type { ModelRole } from "../src/features/model/contract.ts"

// What served model calls spent (docs/features/model-endpoint.md#budget), one `model_usage` row per call. The
// deployment-wide budget is checked against today's rows (UTC) before each call.

/** Tokens, input and output together, that served calls spent since midnight UTC. */
export const spentToday = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const [row] = yield* sql<{ readonly tokens: string }>`
    SELECT coalesce(sum(input_tokens + output_tokens), 0)::text AS tokens FROM model_usage
    WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`
  return Number(row!.tokens)
})

/**
 * Records what one served call spent, keyed by `invocationId`, the id `ModelProxy.serve` minted for that call. The
 * caller's `requestId` is kept to correlate the row with the caller's records; a caller may repeat it, so it is never
 * the key.
 */
export const record = (spent: {
  readonly invocationId: string
  readonly requestId: string
  readonly role: ModelRole
  readonly modelId: string
  readonly inputTokens: number
  readonly outputTokens: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO model_usage (invocation_id, request_id, role, model_id, input_tokens, output_tokens)
      VALUES (${spent.invocationId}, ${spent.requestId}, ${spent.role}, ${spent.modelId}, ${spent.inputTokens},
        ${spent.outputTokens})`
  })
