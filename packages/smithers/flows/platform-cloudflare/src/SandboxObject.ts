/**
 * The container Durable Object, as a function the object delegates to before
 * it uses its container.
 *
 * {@link wake} starts the container when it is not running, with internet
 * access off, re-arms its inactivity timeout, and registers the outbound
 * HTTP intercepts that are the box's only way out. It is idempotent: an
 * object calls it before each use of the container, and a container already
 * running costs a timeout and the intercepts, re-registered.
 *
 * The function takes the container as a structural slice of an Effect
 * container client, so an Alchemy Durable Object's container handle passes in
 * as is (`R` is its `RuntimeContext`, `F` its `Fetcher`), and a test passes an
 * in-memory one. It keeps no state and runs no timer or retry of its own; the
 * container client's `start` coordinates concurrent starts.
 *
 * @since 1.0.0-rc.17
 */

import * as Effect from "effect/Effect"
import * as Metric from "effect/Metric"
import * as Observed from "./internal/Observed.ts"

/**
 * The slice of an Effect container client {@link wake} uses.
 *
 * `F` is the container client's fetcher type: Alchemy's `Fetcher`, or a
 * Worker's own `Fetcher` for a raw `ctx.container`. An Alchemy Durable
 * Object's container handle satisfies it with `E` its start and container
 * errors and `R = RuntimeContext`.
 *
 * @category models
 * @since 1.0.0-rc.17
 */
export interface Machine<F, E = never, R = never> {
  readonly running: Effect.Effect<boolean, E, R>
  start(options: { readonly enableInternet: false }): Effect.Effect<void, E, R>
  setInactivityTimeout(durationMs: number): Effect.Effect<void, E, R>
  interceptOutboundHttp(addr: string, binding: F): Effect.Effect<void, E, R>
}

/**
 * One outbound HTTP intercept: requests from the box to `host` (a host name,
 * or `host:port`) go to `fetcher`, outside the box, which can add a
 * credential the box never holds.
 *
 * @category models
 * @since 1.0.0-rc.17
 */
export interface Intercept<F> {
  readonly host: string
  readonly fetcher: F
}

/**
 * Options for {@link wake}.
 *
 * - `intercepts`: every outbound HTTP intercept the box gets, registered on
 *   every wake.
 * - `inactivityTimeoutMs`: how long the container runs with no activity on
 *   its Durable Object before Cloudflare stops it. Defaults to
 *   {@link defaultInactivityTimeoutMs}.
 *
 * @category models
 * @since 1.0.0-rc.17
 */
export interface WakeOptions<F> {
  readonly intercepts: ReadonlyArray<Intercept<F>>
  readonly inactivityTimeoutMs?: number | undefined
}

/**
 * What {@link wake} found: it `started` the container, or the container was
 * `running` already.
 *
 * @category models
 * @since 1.0.0-rc.17
 */
export type WakeOutcome = "started" | "running"

/**
 * The inactivity timeout {@link wake} arms unless told another: 30 minutes.
 * It is the backstop that stops an idle container whose sleep never ran.
 *
 * @category constants
 * @since 1.0.0-rc.17
 */
export const defaultInactivityTimeoutMs = 30 * 60 * 1000

/**
 * {@link wake} calls, by `outcome`: `started`, `running` or `failed`.
 *
 * @category metrics
 * @since 1.0.0-rc.17
 */
export const wakes = Metric.counter("smithers_cloudflare_sandbox_wakes", {
  description: "Container Durable Object wakes, by outcome",
  incremental: true
})

/**
 * Makes the container ready to use.
 *
 * 1. Starts it when it is not running, with `enableInternet: false`: the box
 *    reaches nothing but the intercepted hosts.
 * 2. Arms its inactivity timeout, `inactivityTimeoutMs`. A restarted Durable
 *    Object loses the timeout, so every wake sets it again.
 * 3. Registers each intercept, in order. Intercepts must be registered again
 *    after each start; registering them on every wake also repairs an object
 *    that died between its start and its registration, which would otherwise
 *    leave a running box with no way out.
 *
 * It answers `started` or `running`. A failed start, timeout or
 * registration fails with the container client's own error, unchanged; the
 * span and the log line carry only its tag.
 *
 * @category operations
 * @since 1.0.0-rc.17
 */
export const wake = <F, E, R>(machine: Machine<F, E, R>, options: WakeOptions<F>): Effect.Effect<WakeOutcome, E, R> =>
  Effect.gen(function*() {
    const running = yield* machine.running
    if (!running) yield* machine.start({ enableInternet: false })
    yield* machine.setInactivityTimeout(options.inactivityTimeoutMs ?? defaultInactivityTimeoutMs)
    for (const intercept of options.intercepts) {
      yield* machine.interceptOutboundHttp(intercept.host, intercept.fetcher)
    }
    return running ? "running" as const : "started" as const
  }).pipe((effect) =>
    Observed.observed(effect, {
      span: "sandbox.wake",
      attributes: { "smithers.sandbox.intercepts": options.intercepts.length },
      attribute: "smithers.sandbox.wake",
      counter: wakes,
      log: "cloudflare.sandbox.wake"
    })
  )
