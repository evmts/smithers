/**
 * One model call as a durable, sealed flow step.
 *
 * `ModelStep.run` is the way a flow calls a model. It runs inside a flow body,
 * dispatches the call as one `@smthrs/flow` action, and records the provider's
 * whole answer as that action's value. A resumed execution replays the record
 * instead of calling the provider again.
 *
 * - **Key.** The action's idempotency key digests the credential-free prepared
 *   request (route, protocol, URL, public headers and canonical body bytes)
 *   together with the encoded `ModelRequest`. Credentials are applied after
 *   preparation and never enter it. Without a declared cache environment the
 *   engine scopes the key to the execution, so another execution with the same
 *   request calls the provider itself.
 * - **Retries.** Transport faults (a dropped connection, a 5xx, a body that
 *   ends without a settlement) are retried inside the step. A capacity refusal
 *   such as a 429 fails the step without sealing it, and `retryPolicy` retries
 *   it. Every other provider error is sealed as a typed value in
 *   {@link Result.error}.
 * - **Liveness.** Each attempt and each streamed event is a heartbeat. An
 *   attempt that streams nothing for `heartbeatTimeoutMs` fails, and
 *   `retryPolicy` decides whether another runs.
 * - **Streaming.** `onEvent` receives each provider event while the call runs.
 *   A replay hands it the recorded events, without calling the provider.
 *
 * Delivery is at least once. A process that dies, or a fiber cut off, after
 * the provider accepted a call but before the step sealed its answer leaves
 * nothing durable to say how the call ended, so the resumed execution calls
 * the provider again. The `agent_model_step_redispatches` counter counts each
 * such repeat.
 *
 * @since 1.0.0-rc.16
 */

import { type FlowRuntime, RetryPolicy } from "@smthrs/flow"
import type { Model, ModelError, ModelEvent, ModelRequest } from "@smthrs/model"
import type * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import type { RouteResolver } from "./FlowEngineLike.ts"
import * as Internal from "./internal/ModelStep.ts"

/**
 * One model call.
 *
 * @category models
 * @since 1.0.0-rc.16
 */
export interface Options {
  /** The action name, such as `chat/answer/model`. Part of the key. */
  readonly name: string
  readonly request: ModelRequest.ModelRequest
  /** The model that streams the call, with its credential applied. */
  readonly model: Model.Model
  /**
   * The same route's credential-free preparation, which the key digests;
   * `FlowEngineLike.routeResolver` builds one from a configured route. A
   * resolver that disagrees with `model` keys the step on bytes the provider
   * never receives.
   */
  readonly route: RouteResolver
  /** Retries every failure the step does not seal. Defaults to {@link defaultRetryPolicy}. */
  readonly retryPolicy?: RetryPolicy.RetryPolicy | undefined
  /** Milliseconds an attempt may stream nothing. Defaults to {@link defaultHeartbeatTimeoutMs}. */
  readonly heartbeatTimeoutMs?: number | undefined
  /**
   * Receives each event while the call runs, and the recorded events on a
   * replay. An attempt that follows a failed or cut-off one starts with a
   * `retry` event: fold events as `ModelEvent.settledMessage` does, discarding
   * what came before a `retry`. `onEvent` runs inside the step, so a slow one
   * delays the call.
   */
  readonly onEvent?: ((event: ModelEvent.ModelEvent) => Effect.Effect<void>) | undefined
}

/**
 * What a model step settled with.
 *
 * @category models
 * @since 1.0.0-rc.16
 */
export interface Result {
  /** The provider's events, in order, as recorded. */
  readonly events: ReadonlyArray<ModelEvent.ModelEvent>
  /** The provider error the step sealed, when the provider refused the request. */
  readonly error?: ModelError.ModelError | undefined
  /** Whether this run answered from the record, without calling the provider. */
  readonly replayed: boolean
}

/**
 * Everything a model step fails with: a capacity refusal that `retryPolicy`
 * gave up on, a permission failure from the route, or an engine failure
 * deriving the key.
 *
 * @category schemas
 * @since 1.0.0-rc.16
 */
export const Failure = Internal.Failure

/**
 * The decoded form of {@link Failure}.
 *
 * @category models
 * @since 1.0.0-rc.16
 */
export type Failure = typeof Internal.Failure.Type

/**
 * The default retry policy for failures a step does not seal: one second,
 * doubling to thirty, with up to a fifth of each delay shaved off at random so
 * concurrent steps refused together do not return together, for at most two
 * minutes. A permission failure is never retried.
 *
 * @category policies
 * @since 1.0.0-rc.16
 */
export const defaultRetryPolicy: RetryPolicy.RetryPolicy = RetryPolicy.make({
  initialMs: 1_000,
  factor: 2,
  maxMs: 30_000,
  expirationMs: 120_000,
  jitterRatio: 0.2,
  nonRetryable: ["@smthrs/capability/PermissionRequired", "@smthrs/capability/PermissionDenied"]
})

/**
 * The default for {@link Options.heartbeatTimeoutMs}: sixty seconds.
 *
 * @category policies
 * @since 1.0.0-rc.16
 */
export const defaultHeartbeatTimeoutMs = 60_000

/**
 * Calls a model as one durable, sealed step of the running flow.
 *
 * @example
 * ```ts
 * import { FlowEngineLike, ModelStep } from "@smthrs/agent"
 * import { type Model, ModelEvent, type ModelRequest } from "@smthrs/model"
 * import * as Effect from "effect/Effect"
 *
 * const answer = (
 *   model: Model.Model,
 *   route: FlowEngineLike.RouteResolver,
 *   request: ModelRequest.ModelRequest
 * ) =>
 *   Effect.gen(function*() {
 *     const result = yield* ModelStep.run({ name: "chat/answer/model", request, model, route })
 *     return ModelEvent.ModelEvent.settledMessage(result.events).message
 *   })
 * ```
 *
 * @category execution
 * @since 1.0.0-rc.16
 */
export const run = (
  options: Options
): Effect.Effect<Result, Failure, Crypto.Crypto | FlowRuntime.FlowRuntime | FlowRuntime.FlowInstance> =>
  Effect.gen(function*() {
    const prepared = yield* options.route.prepare(options.request)
    const key = yield* Internal.key(Internal.material(options.request), prepared)
    const { recorded, replayed } = yield* Internal.dispatch({
      name: options.name,
      key,
      request: options.request,
      model: options.model,
      retryPolicy: options.retryPolicy ?? defaultRetryPolicy,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? defaultHeartbeatTimeoutMs,
      onEvent: options.onEvent
    })
    if (replayed && options.onEvent !== undefined) {
      yield* Effect.forEach(recorded.events, options.onEvent, { discard: true })
    }
    return { events: recorded.events, ...(recorded.error === undefined ? {} : { error: recorded.error }), replayed }
  })
