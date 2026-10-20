import { ModelProxy, ModelRequest } from "@smthrs/model"
import { HostModel, HostModelUnusable } from "@smthrs/model-host"
import { Cause, Config, Effect, type Layer, Metric, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import type { ModelRole } from "../src/features/model/contract.ts"
import { canAsk, Sessions } from "./Actor.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ModelRoles from "./ModelRoles.ts"
import * as ModelUsage from "./ModelUsage.ts"

// The metered model endpoint (docs/features/model-endpoint.md): every model call the browser's agent makes is one
// `POST /api/model/<role>`, served by `ModelProxy.serve` from @smthrs/model. Before the model runs it refuses a
// signed-out request and one from a person who may not ask (a Guest, or no role), bounds the request, checks the
// deployment's daily budget and picks the role's model; after, it records what the call spent. The key never leaves
// the Worker, and refusals carry codes, never provider text.

/** The deployment's token budget per UTC day, input and output together, when `MODEL_DAILY_TOKEN_BUDGET` is unset. */
export const DAILY_TOKEN_BUDGET = 1_000_000

/** The most output tokens one call may ask for when `MODEL_MAX_OUTPUT_TOKENS` is unset. */
export const MAX_OUTPUT_TOKENS = 8_000

/** The most messages one call may send when `MODEL_MAX_MESSAGES` is unset. */
export const MAX_MESSAGES = 200

/** `model_usage` writes, by `outcome` (`recorded` or `error`). */
export const usageWrites = Metric.counter("smithers_model_usage_writes", {
  description: "Model usage rows written after served calls, by outcome",
  incremental: true,
})

const positive = Schema.Int.check(Schema.isGreaterThan(0))

const refuse = (status: number, code: ModelProxy.Refusal["code"], message: string) =>
  new ModelProxy.Refusal({ status, code, message })

const unavailable = refuse(503, "provider_internal", "Smithers can't reach its database. Try again.")

const noRoute = refuse(503, "no_route", "This model isn't available.")

/**
 * Reads `MODEL_DAILY_TOKEN_BUDGET`, `MODEL_MAX_OUTPUT_TOKENS` and `MODEL_MAX_MESSAGES` and the deployment's default
 * model (`HostModel`), and returns the handler for one role. `database` opens a Postgres client for each read and
 * write.
 */
export const make = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Effect.gen(function* () {
    const budget = yield* Config.schema(positive, "MODEL_DAILY_TOKEN_BUDGET").pipe(
      Config.withDefault(DAILY_TOKEN_BUDGET),
    )
    const maxOutputTokens = yield* Config.schema(positive, "MODEL_MAX_OUTPUT_TOKENS").pipe(
      Config.withDefault(MAX_OUTPUT_TOKENS),
    )
    const maxMessages = yield* Config.schema(positive, "MODEL_MAX_MESSAGES").pipe(Config.withDefault(MAX_MESSAGES))
    const fallback = yield* HostModel

    /** Logs why the endpoint couldn't serve a role, by code only. */
    const logFailure = (role: ModelRole, errorCode: string) =>
      Effect.logError("model.endpoint").pipe(Effect.annotateLogs({ role, errorCode }))

    /** What the caller may choose (the conversation, its tools and parameters within bounds) and the role's model. */
    const prepare = (role: ModelRole) => (request: ModelRequest.ModelRequest) =>
      Effect.gen(function* () {
        const sessions = yield* Sessions
        const actor = yield* sessions.resolve.pipe(
          Effect.tapError((error) => logFailure(role, codeOf(error))),
          Effect.mapError(() => unavailable),
        )
        if (Option.isNone(actor)) {
          return yield* refuse(401, "authentication", "Sign in to ask Smithers.")
        }
        // Asking is `repo:ask`, Member or above (decision 0007). `ModelError` has no permission code, so a refusal of
        // a signed-in person is `authentication` with 403, as a provider's 403 classifies.
        if (!canAsk(actor.value)) {
          return yield* refuse(403, "authentication", "Asking Smithers needs the Member role.")
        }
        if ((request.serverTools?.length ?? 0) > 0) {
          return yield* refuse(400, "invalid_request", "Send no provider-run tools.")
        }
        if (request.messages.length === 0) return yield* refuse(400, "invalid_request", "Send at least one message.")
        if (request.messages.length > maxMessages) {
          return yield* refuse(400, "invalid_request", `Send at most ${maxMessages} messages.`)
        }
        const spent = yield* ModelUsage.spentToday.pipe(
          Effect.provide(database),
          Effect.tapError((error) => logFailure(role, codeOf(error))),
          Effect.mapError(() => unavailable),
        )
        if (spent >= budget) return yield* refuse(429, "quota_exceeded", "Today's model budget is spent.")
        const resolved = yield* ModelRoles.resolve(role).pipe(
          Effect.provide(database),
          Effect.provideService(HostModel, fallback),
          Effect.tapError((error) =>
            logFailure(role, error instanceof HostModelUnusable ? `unusable:${error.reason}` : codeOf(error))
          ),
          Effect.mapError((error) => error instanceof HostModelUnusable ? noRoute : unavailable),
        )
        const { maxTokens, thinkingBudget } = request.params
        return {
          model: resolved.model,
          request: ModelRequest.ModelRequest.make({
            ...request,
            modelId: resolved.modelId,
            params: ModelRequest.GenerationParams.make({
              ...request.params,
              maxTokens: Math.min(maxTokens ?? maxOutputTokens, maxOutputTokens),
              ...(thinkingBudget === undefined ? {} : { thinkingBudget: Math.min(thinkingBudget, maxOutputTokens) }),
            }),
          }),
        } satisfies ModelProxy.Prepared
      })

    /** Records what a served call spent; a failure is logged and counted, never raised into the response. */
    const meter = (role: ModelRole) => (end: ModelProxy.End) =>
      ModelUsage.record({
        invocationId: end.invocationId,
        requestId: end.requestId,
        role,
        modelId: end.modelId,
        inputTokens: end.usage.inputTokens ?? 0,
        outputTokens: end.usage.outputTokens ?? 0,
      }).pipe(
        Effect.provide(database),
        Effect.andThen(Metric.update(Metric.withAttributes(usageWrites, { outcome: "recorded" }), 1)),
        Effect.catchCause((cause) =>
          Effect.andThen(
            Metric.update(Metric.withAttributes(usageWrites, { outcome: "error" }), 1),
            Effect.logError("model.usage").pipe(
              Effect.annotateLogs({
                role,
                invocationId: end.invocationId,
                requestId: end.requestId,
                errorCode: codeOf(Cause.squash(cause)),
              }),
            ),
          )
        ),
      )

    /** `POST /api/model/<role>`: one served model call. */
    return (role: ModelRole) =>
      ModelProxy.serve({ prepare: prepare(role), attributes: { role }, onEnd: meter(role) })
  })
