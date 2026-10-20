import { ModelProxy, ModelRequest } from "@smthrs/model"
import { HostModel, HostModelUnusable } from "@smthrs/model-host"
import { Cause, Config, Duration, Effect, type Layer, Metric, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import type { ModelRole } from "../src/features/model/contract.ts"
import { canAsk, Sessions } from "./Actor.ts"
import { codeOf } from "./ErrorCode.ts"
import * as ModelRoles from "./ModelRoles.ts"
import * as ModelUsage from "./ModelUsage.ts"

// The metered model endpoint (docs/features/model-endpoint.md): every model call the browser's agent makes is one
// `POST /api/model/<role>`, served by `ModelProxy.serve` from @smthrs/model. Before the model runs it refuses a
// signed-out request and one from a person who may not ask (a Guest, or no role), bounds the request, picks the role's
// model and reserves the call's worst case against the deployment's daily budget; after, it settles the reservation to
// what the call spent. The key never leaves the Worker, and refusals carry codes, never provider text.

/** The deployment's token budget per UTC day, input and output together, when `MODEL_DAILY_TOKEN_BUDGET` is unset. */
export const DAILY_TOKEN_BUDGET = 1_000_000

/** The most output tokens one call may ask for when `MODEL_MAX_OUTPUT_TOKENS` is unset. */
export const MAX_OUTPUT_TOKENS = 8_000

/** The most messages one call may send when `MODEL_MAX_MESSAGES` is unset. */
export const MAX_MESSAGES = 200

/**
 * The largest request body, in bytes, when `MODEL_MAX_REQUEST_BYTES` is unset: 192 KiB. It is the prompt's token cap
 * too, because a call reserves each byte as a token. The agent compacts against a 32,768-token window
 * (`CONTEXT_WINDOW_TOKENS`, src/features/agent/host.ts), about 128 KiB of text at four bytes a token, and its JSON
 * body adds field names and escapes, so a smaller bound would refuse requests the agent counts as fitting.
 */
export const MAX_REQUEST_BYTES = 192 * 1024

/**
 * How long a call's reservation lasts before it is final, when `MODEL_RESERVATION_EXPIRY` is unset: an hour. A
 * reservation that never settles (its Worker died, or its settle never ran) counts in full either way; past its expiry,
 * a late settle can't refund it. The longest call the caps allow writes 16,000 tokens (`MAX_OUTPUT_TOKENS` of output
 * and as many of thinking), about 27 minutes at 10 tokens a second, so an hour leaves every call time to settle.
 */
export const RESERVATION_EXPIRY = Duration.hours(1)

/**
 * Settles of a served call's reservation, by `outcome`: `recorded` (settled to what it spent), `kept` (its usage was
 * unknown, so it keeps its reservation), `expired` (it ended after its reservation expired, so it stays charged in
 * full) or `error`.
 */
export const usageWrites = Metric.counter("smithers_model_usage_writes", {
  description: "Model usage settled after served calls, by outcome",
  incremental: true,
})

const positive = Schema.Int.check(Schema.isGreaterThan(0))

const refuse = (status: number, code: ModelProxy.Refusal["code"], message: string) =>
  new ModelProxy.Refusal({ status, code, message })

const unavailable = refuse(503, "provider_internal", "Smithers can't reach its database. Try again.")

const noRoute = refuse(503, "no_route", "This model isn't available.")

const INVALID_CAPS = "Send maxTokens as a whole number above 0 and thinkingBudget as a whole number of at least 0."

/**
 * Reads `MODEL_DAILY_TOKEN_BUDGET`, `MODEL_MAX_OUTPUT_TOKENS`, `MODEL_MAX_MESSAGES`, `MODEL_MAX_REQUEST_BYTES`,
 * `MODEL_RESERVATION_EXPIRY` and the deployment's default model (`HostModel`), and returns the handler for one role.
 * `database` opens a Postgres client for each read and write.
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
    const maxBodyBytes = yield* Config.schema(positive, "MODEL_MAX_REQUEST_BYTES").pipe(
      Config.withDefault(MAX_REQUEST_BYTES),
    )
    const expiry = yield* Config.Duration("MODEL_RESERVATION_EXPIRY").pipe(Config.withDefault(RESERVATION_EXPIRY))
    const fallback = yield* HostModel

    /** Logs why the endpoint couldn't serve a role, by code only. */
    const logFailure = (role: ModelRole, errorCode: string) =>
      Effect.logError("model.endpoint").pipe(Effect.annotateLogs({ role, errorCode }))

    /**
     * What the caller may choose (the conversation, its tools and parameters within bounds) and the role's model, once
     * the call's worst case is reserved: its body's bytes, each counted as a prompt token, plus its output and thinking
     * caps. The reservation is the last step, so no refusal after it leaves one behind.
     */
    const prepare = (role: ModelRole) => (request: ModelRequest.ModelRequest, admission: ModelProxy.Admission) =>
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
        // The reservation counts both caps, so each must be a whole number of tokens: a negative or fractional one
        // would shrink the reservation while the provider still spends (Opus review 4, P2-1).
        const { maxTokens: askedTokens, thinkingBudget: askedThinking } = request.params
        if (
          (askedTokens !== undefined && !(Number.isInteger(askedTokens) && askedTokens > 0)) ||
          (askedThinking !== undefined && !(Number.isInteger(askedThinking) && askedThinking >= 0))
        ) {
          return yield* refuse(400, "invalid_request", INVALID_CAPS)
        }
        const resolved = yield* ModelRoles.resolve(role).pipe(
          Effect.provide(database),
          Effect.provideService(HostModel, fallback),
          Effect.tapError((error) =>
            logFailure(role, error instanceof HostModelUnusable ? `unusable:${error.reason}` : codeOf(error))
          ),
          Effect.mapError((error) => error instanceof HostModelUnusable ? noRoute : unavailable),
        )
        const maxTokens = Math.min(askedTokens ?? maxOutputTokens, maxOutputTokens)
        const thinkingBudget = askedThinking === undefined ? undefined : Math.min(askedThinking, maxOutputTokens)
        const params = ModelRequest.GenerationParams.make({
          ...request.params,
          maxTokens,
          ...(thinkingBudget === undefined ? {} : { thinkingBudget }),
        })
        const reserved = yield* ModelUsage.reserve({
          invocationId: admission.invocationId,
          requestId: admission.requestId,
          role,
          modelId: resolved.modelId,
          tokens: admission.requestBytes + maxTokens + (thinkingBudget ?? 0),
        }, { budget, expiry }).pipe(
          Effect.provide(database),
          Effect.tapError((error) => logFailure(role, codeOf(error))),
          Effect.mapError(() => unavailable),
        )
        if (!reserved) return yield* refuse(429, "quota_exceeded", "Today's model budget is spent.")
        return {
          model: resolved.model,
          request: ModelRequest.ModelRequest.make({ ...request, modelId: resolved.modelId, params }),
        } satisfies ModelProxy.Prepared
      })

    /**
     * Settles a served call's reservation, whether it succeeded, failed or lost its client. Only a call that ended
     * normally with both counts reported settles to them. Any other usage is unknown, never zero: a call that failed or
     * lost its client may have spent tokens the model never reported, so it keeps its reservation (`kept`). A call that
     * ends after its reservation expired stays charged in full (`expired`). A failed write is logged and counted, never
     * raised into the response, and leaves the reservation counted.
     */
    const meter = (role: ModelRole) => (end: ModelProxy.End) => {
      const { inputTokens, outputTokens } = end.usage
      const reported = inputTokens !== undefined && outputTokens !== undefined
        ? "complete"
        : inputTokens !== undefined || outputTokens !== undefined
        ? "partial"
        : "none"
      const complete = end.outcome === "success" && reported === "complete"
      const ids = { role, invocationId: end.invocationId, requestId: end.requestId }
      const record = (settled: boolean) => {
        const outcome = !settled ? "expired" : complete ? "recorded" : "kept"
        const counted = Metric.update(Metric.withAttributes(usageWrites, { outcome }), 1)
        if (outcome === "recorded") return counted
        const line = outcome === "expired"
          ? Effect.logWarning("model.usage").pipe(Effect.annotateLogs({ ...ids, outcome, ended: end.outcome }))
          : Effect.logInfo("model.usage").pipe(Effect.annotateLogs({ ...ids, outcome, ended: end.outcome, reported }))
        return Effect.andThen(counted, line)
      }
      return ModelUsage.settle({ invocationId: end.invocationId, inputTokens, outputTokens, complete }).pipe(
        Effect.provide(database),
        Effect.flatMap(record),
        Effect.catchCause((cause) =>
          Effect.andThen(
            Metric.update(Metric.withAttributes(usageWrites, { outcome: "error" }), 1),
            Effect.logError("model.usage").pipe(
              Effect.annotateLogs({ ...ids, errorCode: codeOf(Cause.squash(cause)) }),
            ),
          )
        ),
      )
    }

    /** `POST /api/model/<role>`: one served model call. */
    return (role: ModelRole) =>
      ModelProxy.serve({ prepare: prepare(role), maxBodyBytes, attributes: { role }, onEnd: meter(role) })
  })
