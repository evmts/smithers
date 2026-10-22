/**
 * A `BroadcastChannel` as an Effect service.
 *
 * Every tab and worker of one origin that opens a channel by the same name
 * receives what any other one posts, never its own posts. The engine's
 * followers send their requests to the leader this way, and the leader sends
 * its replies and run events back.
 *
 * A subscriber holds at most the channel's capacity of messages it has not
 * taken ({@link defaultCapacity} unless {@link make} is given another). One
 * that falls that far behind is ended, never dropped from silently: after the
 * messages it holds, its next take fails with {@link TabChannelOverflow}, and
 * the channel logs `browser.tab_channel.overflow` and counts {@link overflows}.
 * Every other subscriber keeps receiving.
 *
 * @since 1.0.0
 */

import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"

/**
 * The slice of `BroadcastChannel` this service uses.
 *
 * @category models
 * @since 1.0.0
 */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void
  close(): void
  onmessage: ((event: MessageEvent) => void) | null
}

/**
 * How many messages a subscriber holds before it is ended: 10,000.
 *
 * @category constants
 * @since 1.0.0
 */
export const defaultCapacity = 10_000

/**
 * A subscriber fell `capacity` messages behind on `channel`, so the channel
 * ended it after the messages it holds.
 *
 * @category errors
 * @since 1.0.0
 */
export class TabChannelOverflow extends Schema.TaggedError<TabChannelOverflow>()(
  "@smthrs/platform-browser/TabChannelOverflow",
  { channel: Schema.String, capacity: Schema.Number }
) {}

/**
 * Subscribers a channel ended because they fell its capacity of messages
 * behind, by `channel`.
 *
 * @category metrics
 * @since 1.0.0
 */
export const overflows = Metric.counter("smithers_browser_tab_channel_overflows", {
  description: "Subscribers a tab channel ended because they fell its capacity of messages behind, by channel",
  incremental: true
})

/**
 * One open channel.
 *
 * @category models
 * @since 1.0.0
 */
export interface Port {
  /** Sends a structured-cloneable message to every other port of the channel. */
  readonly post: (message: unknown) => Effect.Effect<void>
  /**
   * Receives every message posted to the channel from now until the scope
   * closes. Each subscription sees each message. A subscription that holds
   * the channel's capacity of messages it has not taken is ended: after them,
   * a take fails with {@link TabChannelOverflow}.
   */
  readonly subscribe: Effect.Effect<Queue.Dequeue<unknown, TabChannelOverflow>, never, Scope.Scope>
}

/**
 * Channel operations.
 *
 * @category models
 * @since 1.0.0
 */
export interface Service {
  /** Opens the channel `name`; it closes with the scope. */
  readonly open: (name: string) => Effect.Effect<Port, never, Scope.Scope>
}

/**
 * Service tag for broadcast channels.
 *
 * @category services
 * @since 1.0.0
 */
export class TabChannel extends Context.Service<TabChannel, Service>()("@smthrs/platform-browser/TabChannel") {}

/**
 * Builds the service over a channel constructor. Each subscriber holds at
 * most `capacity` messages, {@link defaultCapacity} by default.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (
  construct: (name: string) => BroadcastChannelLike,
  options?: { readonly capacity?: number | undefined }
): Service => {
  const capacity = options?.capacity ?? defaultCapacity
  return TabChannel.of({
    open: (name) =>
      Effect.gen(function*() {
        const subscribers = new Set<Queue.Queue<unknown, TabChannelOverflow>>()
        // Each subscriber the channel ended, once, so the overflow is logged and counted in the program's own services.
        const ended = yield* Queue.unbounded<TabChannelOverflow>()
        const record = (overflow: TabChannelOverflow) =>
          Metric.update(Metric.withAttributes(overflows, { channel: overflow.channel }), 1).pipe(
            Effect.andThen(
              Effect.logWarning("browser.tab_channel.overflow").pipe(
                Effect.annotateLogs({ channel: overflow.channel, capacity: overflow.capacity })
              )
            )
          )
        // Each overflow is taken and recorded whole, or left for the finalizer to record as the channel closes, as when
        // the overflow itself ends the scope: never lost, never twice.
        yield* Effect.addFinalizer(() => Effect.flatMap(Queue.clear(ended), Effect.forEach(record, { discard: true })))
        yield* Effect.uninterruptibleMask((restore) => Effect.flatMap(restore(Queue.take(ended)), record)).pipe(
          Effect.forever,
          Effect.forkScoped
        )
        const channel = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const channel = construct(name)
            channel.onmessage = (event) => {
              for (const subscriber of subscribers) {
                if (Queue.offerUnsafe(subscriber, event.data)) continue
                // Full: it fell `capacity` messages behind. It ends after what it holds, and is told why.
                subscribers.delete(subscriber)
                const overflow = new TabChannelOverflow({ channel: name, capacity })
                Queue.failCauseUnsafe(subscriber, Cause.fail(overflow))
                Queue.offerUnsafe(ended, overflow)
              }
            }
            return channel
          }),
          (channel) => Effect.sync(() => channel.close())
        )
        return {
          post: (message) => Effect.sync(() => channel.postMessage(message)),
          subscribe: Effect.acquireRelease(
            Effect.tap(Queue.bounded<unknown, TabChannelOverflow>(capacity), (subscriber) =>
              Effect.sync(() => subscribers.add(subscriber))),
            (subscriber) =>
              Effect.sync(() => {
                subscribers.delete(subscriber)
                Queue.shutdownUnsafe(subscriber)
              })
          )
        }
      })
  })
}

/**
 * Provides the service over the global `BroadcastChannel`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<TabChannel> = Layer.succeed(TabChannel)(make((name) => new BroadcastChannel(name)))
