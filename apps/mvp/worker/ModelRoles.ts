import type { Model } from "@smthrs/model"
import { HostModel, HostModelUnusable } from "@smthrs/model-host"
import { Config, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { MODEL_ROLES, type ModelRole } from "../src/features/model/contract.ts"

// Which model answers each role (docs/features/model-endpoint.md#roles): the model an admin set in `model_roles`, read
// on every call, else the deployment's default (`HostModel`, from the `CHAT_MODEL` configuration). The summary role's
// default is its own (`SUMMARY_MODEL`), never the agent's; the coding role's is the agent role's model, a row
// included, so the `todo` run's agent changes only when an admin sets `coding` itself (decision 0033). Changing a role
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

/**
 * The deployment's default model when `CHAT_MODEL` is unset: ChatApi's, and the agent evals' (evals/agent.eval.ts).
 */
export const DEFAULT_CHAT_MODEL: ModelRecord = {
  protocol: "openai-chat",
  baseUrl: "https://api.cerebras.ai",
  modelId: "qwen-3.8-27b",
  credential: "CEREBRAS_API_KEY",
}

/** The model that answers a role now, and where the choice came from. */
export interface Resolved {
  readonly source: "setting" | "default"
  readonly modelId: string
  readonly model: Model.Model
}

const decodeRecord = Schema.decodeUnknownEffect(ModelRecord)

/**
 * The summary role's model when no admin set one: `SUMMARY_MODEL`, a model record as JSON, such as a cheap model for
 * the timeline's summaries. Unset, the role has no model.
 */
export const summaryModel = Config.option(Config.schema(Schema.fromJsonString(ModelRecord), "SUMMARY_MODEL"))

/**
 * The model `role` uses: its `model_roles` row, built with the key the Worker holds, or the deployment default when
 * the role has no row: `SUMMARY_MODEL` for the summary role, the agent role's row for the coding role, else
 * `HostModel`. A row or default this Worker can't use fails with `HostModelUnusable` and the planner's reason
 * (`invalid` for a row that isn't a record, `unconfigured` for a summary role with neither a row nor `SUMMARY_MODEL`,
 * `config` for one that doesn't parse).
 */
export const resolve = (role: ModelRole) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rowOf = (name: ModelRole) =>
      Effect.map(sql<{ readonly model: unknown }>`SELECT model FROM model_roles WHERE role = ${name}`, ([found]) => found)
    const own = yield* rowOf(role)
    // The coding role answers as the agent role does, its row included, until an admin points it somewhere of its own.
    const row = own === undefined && role === "coding" ? yield* rowOf("agent") : own
    if (row === undefined) {
      // Auxiliary navigation must not silently spend on the main agent model: only its own default answers it.
      if (role === "summary") {
        const configured = yield* summaryModel.pipe(
          Effect.mapError(() => new HostModelUnusable({ reason: "config" })),
        )
        if (Option.isNone(configured)) return yield* new HostModelUnusable({ reason: "unconfigured" })
        const built = yield* HostModel.make(configured.value)
        return { source: "default", modelId: built.modelId, model: built.model } satisfies Resolved
      }
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
 * so a replayed step changes neither the setting nor its audit history.
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
        const inserted = yield* sql`
          INSERT INTO model_role_changes (invocation_key, role, model, changed_by)
          VALUES (${by.invocationKey}, ${change.role}, ${model}::jsonb, ${by.actorId})
          ON CONFLICT (invocation_key) DO NOTHING
          RETURNING invocation_key`
        if (inserted.length === 0) return
        yield* sql`
          INSERT INTO model_roles (role, model, updated_by, updated_at)
          VALUES (${change.role}, ${model}::jsonb, ${by.actorId}, now())
          ON CONFLICT (role) DO UPDATE SET model = EXCLUDED.model, updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at`
      }),
    )
  })
