/**
 * A `BroadcastChannel` as an Effect service.
 *
 * Every tab and worker of one origin that opens a channel by the same name
 * receives what any other one posts, never its own posts. The engine's
 * followers send their requests to the leader this way, and the leader sends
 * its replies and run events back.
 *
 * @since 1.0.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
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
   * closes. Each subscription sees each message.
   */
  readonly subscribe: Effect.Effect<PubSub.Subscription<unknown>, never, Scope.Scope>
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
 * Builds the service over a channel constructor.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (construct: (name: string) => BroadcastChannelLike): Service =>
  TabChannel.of({
    open: (name) =>
      Effect.gen(function*() {
        const messages = yield* Effect.acquireRelease(PubSub.unbounded<unknown>(), PubSub.shutdown)
        const channel = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const channel = construct(name)
            channel.onmessage = (event) => {
              PubSub.publishUnsafe(messages, event.data)
            }
            return channel
          }),
          (channel) => Effect.sync(() => channel.close())
        )
        return {
          post: (message) => Effect.sync(() => channel.postMessage(message)),
          subscribe: PubSub.subscribe(messages)
        }
      })
  })

/**
 * Provides the service over the global `BroadcastChannel`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<TabChannel> = Layer.succeed(TabChannel)(make((name) => new BroadcastChannel(name)))
