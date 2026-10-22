import type { FlowEngineLike } from "@smthrs/agent"
import { Model, ModelError, ModelEvent, ModelProxy, ModelRequest } from "@smthrs/model"
import { HostModel, HostModelUnusable } from "@smthrs/model-host"
import { Cause, Config, Duration, Effect, Exit, type Layer, Metric, Option, Schema, Stream } from "effect"
import type { SqlClient } from "effect/sql"
import { MODEL_ROUTE, type ModelRole } from "../src/features/model/contract.ts"
import { canAsk, Sessions } from "./Actor.ts"
import { codeOf } from "./ErrorCode.ts"
import { FlowStarter } from "./Flows.ts"
import * as ModelRoles from "./ModelRoles.ts"
import * as ModelSpend from "./ModelSpend.ts"
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
 * Settles of a served call's reservation, by `outcome`: `recorded` (settled to what it spent), `refused` (the provider
 * refused it before any output, so it settled to the usage the provider reported, 0 when none), `kept` (its usage was
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

// A role whose model can't be used here is a setting to change, not an outage to wait out: a 4xx, which a caller's
// model step seals as its answer. A 503 was a capacity refusal to the step, which the engine retried six times.
const noRoute = refuse(409, "no_route", "This model isn't available.")

const INVALID_CAPS = "Send maxTokens as a whole number above 0 and thinkingBudget as a whole number of at least 0."

/**
 * Reads `MODEL_DAILY_TOKEN_BUDGET`, `MODEL_MAX_OUTPUT_TOKENS`, `MODEL_MAX_MESSAGES`, `MODEL_MAX_REQUEST_BYTES`,
 * `MODEL_RESERVATION_EXPIRY`, `SUMMARY_MODEL` and the deployment's default model (`HostModel`) at build time,
 * and returns what admits and meters one call on a role: `admit` bounds the request, picks the role's model and reserves
 * the call's worst case; `meter` settles it. The endpoint (`make`) and a server flow's own calls (`local`) share them,
 * so every call spends one budget.
 * `database` opens a Postgres client for each read and write.
 */
const metering = <E, R>(database: Layer.Layer<SqlClient.SqlClient, E, R>) =>
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
    // Alchemy binds settings read while the program builds; keep a bad value as a per-call refusal.
    const summary = yield* ModelRoles.summaryModel.pipe(
      Effect.mapError(() => new HostModelUnusable({ reason: "config" })),
      Effect.result,
    )
    const fallback = yield* HostModel

    /** Logs why the endpoint couldn't serve a role, by code only. */
    const logFailure = (role: ModelRole, errorCode: string) =>
      Effect.logError("model.endpoint").pipe(Effect.annotateLogs({ role, errorCode }))

    /**
     * What the caller may choose (the conversation, its tools and parameters within bounds) and the role's model, once
     * the call's worst case is reserved: its body's bytes, each counted as a prompt token, plus its output and thinking
     * caps. The reservation is the last step, so no refusal after it leaves one behind.
     */
    const admit = (role: ModelRole) => (request: ModelRequest.ModelRequest, admission: ModelProxy.Admission) =>
      Effect.gen(function* () {
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
        const resolved = yield* ModelRoles.resolve(role, summary).pipe(
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
     * Settles a served call's reservation, whether it succeeded, failed or lost its client. A call that ended normally
     * with both counts reported settles to them. A call the provider refused before any output (`rate_limited`, or a
     * provider 4xx: `ModelProxy.refusedCleanly`) spent nothing beyond what the provider reported, so it settles to
     * that, 0 when none (`refused`). Any other usage is unknown, never zero: a call that failed or lost its client may
     * have spent tokens the model never reported, so it keeps its reservation (`kept`). A call that ends after its
     * reservation expired stays charged in full (`expired`). A failed write is logged and counted, never raised into
     * the response, and leaves the reservation counted. First it records what the model reported the call spent, by
     * role and model (`ModelSpend.record`).
     */
    const meter = (role: ModelRole) => (end: ModelProxy.End) => {
      const { inputTokens, outputTokens } = end.usage
      const reported = inputTokens !== undefined && outputTokens !== undefined
        ? "complete"
        : inputTokens !== undefined || outputTokens !== undefined
        ? "partial"
        : "none"
      const refused = ModelProxy.refusedCleanly(end)
      const complete = (end.outcome === "success" && reported === "complete") || refused
      const ids = { role, invocationId: end.invocationId, requestId: end.requestId }
      const failure = end.errorCode === undefined ? {} : { errorCode: end.errorCode }
      const record = (settled: boolean) => {
        const outcome = !settled ? "expired" : refused ? "refused" : complete ? "recorded" : "kept"
        const counted = Metric.update(Metric.withAttributes(usageWrites, { outcome }), 1)
        if (outcome === "recorded") return counted
        const line = outcome === "expired"
          ? Effect.logWarning("model.usage").pipe(
            Effect.annotateLogs({ ...ids, outcome, ended: end.outcome, ...failure }),
          )
          : Effect.logInfo("model.usage").pipe(
            Effect.annotateLogs({ ...ids, outcome, ended: end.outcome, reported, ...failure }),
          )
        return Effect.andThen(counted, line)
      }
      return Effect.andThen(
        ModelSpend.record(role, end),
        ModelUsage.settle({ invocationId: end.invocationId, inputTokens, outputTokens, complete }),
      ).pipe(
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

    return { admit, meter, maxBodyBytes, logFailure, budget }
  })

/**
 * The model endpoint's handler for one role, `POST /api/model/<role>`: it refuses a signed-out request and one from a
 * person who may not ask (a Guest, or no role), then admits and meters the call (`metering`). Each admitted call starts
 * its window's spend alert through `Flows.FlowStarter` (`ModelSpend.alerter`, docs/features/spend-alerts.md): on unless
 * `MODEL_SPEND_ALERTS` says otherwise, whose default is `alerts`, on unless set.
 */
export const make = <E, R>(
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
  options: { readonly alerts?: boolean } = {},
) =>
  Effect.gen(function* () {
    const { admit, meter, maxBodyBytes, logFailure, budget } = yield* metering(database)
    const alert = yield* ModelSpend.alerter(
      yield* ModelSpend.settings(options.alerts === undefined ? {} : { on: options.alerts }),
      budget,
    )
    /** Who may ask (`repo:ask`, decision 0007), then the call's admission. */
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
        return yield* admit(role)(request, admission).pipe(Effect.tap(() => alert))
      })

    /** `POST /api/model/<role>`: one served model call. */
    return (role: ModelRole) =>
      ModelProxy.serve({ prepare: prepare(role), maxBodyBytes, attributes: { role }, onEnd: meter(role) })
  })

/** A model a server flow calls with, and the route its durable step keys on (`ModelStep.model` from `@smthrs/agent`). */
export interface Seat {
  readonly model: Model.Model
  readonly route: FlowEngineLike.RouteResolver
}

/** A refusal of a server flow's own call, as the model error its caller reads: the endpoint's code and status. */
const refusedCall = (refusal: ModelProxy.Refusal) =>
  new ModelError.ModelError({ code: refusal.modelErrorCode, message: refusal.message, httpStatus: refusal.status })

/**
 * The model a flow running on the server calls `role` with, in process: each call is admitted and metered exactly as the
 * endpoint's (`metering`), against the same daily budget and ledger, so a flow no person's device runs (triage on a new
 * issue, decision 0012 §5) spends what a person's call would. It skips the endpoint's who-may-ask check: the flow that
 * calls it was admitted under a person's role, which it re-checks itself. Its step keys on the endpoint's request
 * (`ModelProxy.prepare`), so a resumed run replays the sealed call instead of paying for it again. A refusal fails the
 * stream as a `ModelError` with the endpoint's code: `quota_exceeded` once the day's budget is spent.
 *
 * Given `starter`, where the host starts a flow, each admitted call also starts its window's spend alert, as the
 * endpoint's calls do (`ModelSpend.alerter`, docs/features/spend-alerts.md): a window whose only spend is a `todo` run's
 * agent or triage's judge alerts too. `alerts` is `MODEL_SPEND_ALERTS`' default, on unless set, as `make`'s is.
 */
export const local = <E, R>(
  database: Layer.Layer<SqlClient.SqlClient, E, R>,
  options: { readonly alerts?: boolean } = {},
) =>
  Effect.gen(function* () {
    const { admit, meter, maxBodyBytes, budget } = yield* metering(database)
    const alert = yield* ModelSpend.alerter(
      yield* ModelSpend.settings(options.alerts === undefined ? {} : { on: options.alerts }),
      budget,
    )
    // What the database layer needs, captured here, so a model call needs nothing of its caller.
    const context = yield* Effect.context<R>()
    return (role: ModelRole, starter?: FlowStarter["Service"]): Seat => {
      const prepare = ModelProxy.prepare({ url: `${MODEL_ROUTE}/${role}` })
      const call = (request: ModelRequest.ModelRequest) =>
        Effect.gen(function* () {
          // The endpoint's id for a call is its own, never the caller's; so is this one.
          const invocationId = crypto.randomUUID()
          const encoded = yield* prepare(request)
          if (encoded.body.byteLength > maxBodyBytes) {
            return yield* new ModelError.ModelError({ code: "invalid_request", message: "The request is too large.", httpStatus: 413 })
          }
          const admission = { requestId: invocationId, invocationId, requestBytes: encoded.body.byteLength }
          const prepared = yield* admit(role)(request, admission).pipe(Effect.mapError(refusedCall))
          if (starter !== undefined) yield* alert.pipe(Effect.provideService(FlowStarter, starter))
          // What the model reported, merged as `ModelEvent.settledMessage` merges it: a `retry` event starts it over.
          let usage: ModelEvent.Usage = {}
          // Whether the model sent any output, which tells a refusal (that spent nothing) from a failure that may have.
          let produced = false
          return prepared.model.stream(prepared.request).pipe(
            Stream.tap((event) =>
              Effect.sync(() => {
                usage = ModelEvent.settledMessage([{ type: "usage", ...usage }, event]).usage
                produced ||= ModelProxy.producesOutput(event)
              })
            ),
            Stream.onExit((exit) =>
              meter(role)({
                requestId: invocationId,
                invocationId,
                modelId: prepared.request.modelId,
                usage,
                produced,
                ...(Exit.isSuccess(exit)
                  ? { outcome: "success" as const }
                  : Cause.hasInterruptsOnly(exit.cause)
                  ? { outcome: "interrupted" as const }
                  : { outcome: "failed" as const, ...ModelProxy.failureOf(exit.cause) }),
              })
            ),
          )
        }).pipe(Effect.provideContext(context))
      return {
        model: Model.make({ stream: (request) => Stream.unwrap(call(request)).pipe(Stream.provideContext(context)) }),
        route: { prepare },
      }
    }
  })
