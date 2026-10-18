/**
 * Exclusive Web Locks as an Effect service.
 *
 * The durable engine runs in one worker per origin: the one whose context
 * holds the engine's lock. A browser releases a lock when the context that
 * holds it ends, so closing or crashing the leader tab hands the lock to the
 * next worker waiting for it.
 *
 * A context can also take a lock with `steal`, so the tab a person focuses
 * leads at once (decision 0002's focused tab). The context that held it loses
 * it without ending, and learns so from {@link Held.lost}.
 *
 * @since 1.0.0
 */

import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"

/**
 * The slice of `LockManager` this service uses.
 *
 * @category models
 * @since 1.0.0
 */
export interface LockManagerLike {
  readonly request: (
    name: string,
    options: { readonly signal: AbortSignal } | { readonly steal: true },
    callback: (lock: unknown) => Promise<void>
  ) => Promise<unknown>
}

/**
 * How {@link Service.hold} takes the lock.
 *
 * @category models
 * @since 1.0.0
 */
export interface HoldOptions {
  /**
   * Takes the lock at once, from whichever context holds it, instead of
   * waiting for it. The holder's {@link Held.lost} completes. A steal cannot
   * be withdrawn: interrupting it still takes the lock from its holder, and
   * then gives it back.
   */
  readonly steal?: boolean
}

/**
 * A lock this context holds.
 *
 * @category models
 * @since 1.0.0
 */
export interface Held {
  /**
   * Completes when another context steals the lock. It never completes
   * otherwise: the lock is this context's until the scope closes.
   */
  readonly lost: Effect.Effect<void>
}

/**
 * Lock operations.
 *
 * @category models
 * @since 1.0.0
 */
export interface Service {
  /**
   * Waits until this context holds the exclusive lock `name`, then holds it
   * until the scope closes, or takes it at once with `steal`. Interrupting
   * the wait withdraws the request. A lock manager that refuses the request
   * is a defect.
   */
  readonly hold: (name: string, options?: HoldOptions) => Effect.Effect<Held, never, Scope.Scope>
}

/**
 * Service tag for exclusive locks.
 *
 * @category services
 * @since 1.0.0
 */
export class WebLock extends Context.Service<WebLock, Service>()("@smthrs/platform-browser/WebLock") {}

/**
 * Builds the service over a lock manager.
 *
 * @category constructors
 * @since 1.0.0
 */
export const make = (locks: LockManagerLike): Service =>
  WebLock.of({
    hold: (name, options) =>
      Effect.gen(function*() {
        const lost = yield* Deferred.make<void>()
        yield* Effect.acquireRelease(
          // Interrupting the wait aborts `signal`, which withdraws the request.
          // A steal is granted at once and takes no signal.
          Effect.callback<() => void>((resume, signal) => {
            let granted = false
            locks.request(name, options?.steal === true ? { steal: true } : { signal }, () => {
              // Granted in the moment the wait was interrupted: give it back.
              if (signal.aborted) return Promise.resolve()
              granted = true
              return new Promise<void>((release) => resume(Effect.succeed(release)))
            }).catch((cause: unknown) => {
              // A held lock's request rejects when another context steals it.
              if (granted) Deferred.doneUnsafe(lost, Exit.void)
              // A withdrawn request rejects after the wait was interrupted, and
              // nothing is listening for it any more.
              else if (!signal.aborted) resume(Effect.die(cause))
            })
          }).pipe(Effect.interruptible),
          (release) => Effect.sync(release)
        )
        return { lost: Deferred.await(lost) }
      })
  })

/**
 * Provides the service over `navigator.locks`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layer: Layer.Layer<WebLock> = Layer.sync(WebLock, () => make(navigator.locks))
