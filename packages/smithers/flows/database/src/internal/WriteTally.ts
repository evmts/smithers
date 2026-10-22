/**
 * The open `DatabaseMetrics.tally` scopes of the current fiber.
 *
 * @since 1.0.0
 */

import { Context, Duration, Effect } from "effect"

/**
 * One open tally: what the writes inside it cost so far.
 *
 * @category internal
 * @since 1.0.0
 */
export interface Accumulator {
  transactions: number
  lockWait: Duration.Duration
}

/**
 * Every tally the current fiber runs inside, innermost last. A fiber forked
 * inside a tally inherits it, so its writes count too.
 *
 * @category internal
 * @since 1.0.0
 */
export const Current = Context.Reference<ReadonlyArray<Accumulator>>("@smthrs/database/WriteTally", {
  defaultValue: () => []
})

/**
 * Adds one write transaction that waited `waited` for its writer lock to
 * every open tally.
 *
 * @category internal
 * @since 1.0.0
 */
export const record = (waited: Duration.Duration): Effect.Effect<void> =>
  Effect.gen(function*() {
    for (const accumulator of yield* Current) {
      accumulator.transactions += 1
      accumulator.lockWait = Duration.sum(accumulator.lockWait, waited)
    }
  })
