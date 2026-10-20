/**
 * The sync policy: how long an Electric collection waits before it sends a
 * shape request again after one failed on the network, or with a 5xx or 429.
 *
 * A policy is an Effect `Schedule`. Each failure steps it with a
 * `RequestFailed` and the collection waits the delay it returns, then sends
 * the request again. `reconnect` ends every wait at once. A schedule that
 * ends gives the failure to Electric, which stops the shape until
 * `reconnect`; the default never ends, so a device that went offline syncs
 * again by itself when it comes back.
 *
 * @since 0.1.0
 */

import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"

/**
 * An exponential backoff: `initial`, doubling to `max`.
 *
 * @category models
 * @since 0.1.0
 */
export interface Backoff {
  readonly initial: Duration.Input
  readonly max: Duration.Input
}

/**
 * Waits `initial`, doubling after each failure in a row up to `max`, forever.
 * Each wait is jittered to between 80% and 120% of its delay
 * (`Schedule.jittered`), so devices that lost the same server don't all come
 * back at the same moment.
 *
 * @category constructors
 * @since 0.1.0
 */
export const backoff = (options: Backoff): Schedule.Schedule<Duration.Duration> => {
  const max = Duration.fromInputUnsafe(options.max)
  return Schedule.exponential(options.initial).pipe(
    Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, max))),
    Schedule.jittered
  )
}

/**
 * The policy an Electric collection uses when given none: 1 second, doubling
 * to 10 seconds, jittered, forever.
 *
 * @category constructors
 * @since 0.1.0
 */
export const defaultPolicy: Schedule.Schedule<Duration.Duration> = backoff({ initial: "1 second", max: "10 seconds" })
