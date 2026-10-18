import type { Model } from "@smthrs/model"
import { HostModel, HostModelUnusable } from "@smthrs/model-host"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { MODEL_ROLES, type ModelRole } from "../src/features/model/contract.ts"

// Which model answers each role (docs/features/model-endpoint.md#roles): the model an admin set in `model_roles`, read
// on every call, else the deployment's default (`HostModel`, from the `CHAT_MODEL` configuration). Changing a role
// needs no deploy.

/** One of the model roles, as a schema. */
export const Role = Schema.Literals(MODEL_ROLES)

const nonEmpty = Schema.String.check(Schema.isMinLength(1))

/**
 * The model a role uses: a configured-model record (`@smthrs/rpc` ConfiguredModel) without its name. `credential`
 * names the key the Worker holds, never the key itself.
 */
export const ModelRecord = Schema.Struct({
  protocol: nonEmpty,
  baseUrl: Schema.optional(nonEmpty),
  path: Schema.optional(nonEmpty),
  modelId: nonEmpty,
  credential: nonEmpty,
})

/** The decoded form of {@link ModelRecord}. */
export type ModelRecord = typeof ModelRecord.Type

/** The model that answers a role now, and where the choice came from. */
export interface Resolved {
  readonly source: "setting" | "default"
  readonly modelId: string
  readonly model: Model.Model
}

const decodeRecord = Schema.decodeUnknownEffect(ModelRecord)

/**
 * The model `role` uses: its `model_roles` row, built with the key the Worker holds, or the deployment default when
 * the role has no row. A row this Worker can't use fails with `HostModelUnusable` and the planner's reason (`invalid`
 * for a row that isn't a record).
 */
export const resolve = (role: ModelRole) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly model: unknown }>`SELECT model FROM model_roles WHERE role = ${role}`
    if (row === undefined) {
      const fallback = yield* HostModel
      return { source: "default", modelId: fallback.modelId, model: fallback.model } satisfies Resolved
    }
    const record = yield* decodeRecord(row.model).pipe(
      Effect.mapError(() => new HostModelUnusable({ reason: "invalid" })),
    )
    const built = yield* HostModel.make(record)
    return { source: "setting", modelId: built.modelId, model: built.model } satisfies Resolved
  })

/**
 * Sets `role`'s model and records the change, in one transaction. `invocationKey` names the step that made the change,
 * so a replayed step writes the same row again and records its change once.
 */
export const set = (
  change: { readonly role: ModelRole; readonly model: ModelRecord },
  by: { readonly actorId: string; readonly invocationKey: string },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const model = JSON.stringify(change.model)
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`
          INSERT INTO model_roles (role, model, updated_by, updated_at)
          VALUES (${change.role}, ${model}::jsonb, ${by.actorId}, now())
          ON CONFLICT (role) DO UPDATE SET model = EXCLUDED.model, updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at`
        yield* sql`
          INSERT INTO model_role_changes (invocation_key, role, model, changed_by)
          VALUES (${by.invocationKey}, ${change.role}, ${model}::jsonb, ${by.actorId})
          ON CONFLICT (invocation_key) DO NOTHING`
      }),
    )
  })
