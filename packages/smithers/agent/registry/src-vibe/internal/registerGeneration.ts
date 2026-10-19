/**
 * Hatch (S3-1): the ownership skeleton of `Executable.makeRefresh`'s `register`.
 *
 * The TypeScript runs `fromDescriptor` and `Layer.build` under
 * `uninterruptibleMask`'s `restore`, and publishes the generation in the mask.
 * A VibeLang `restore(...)` passes its argument by name, which adds a generator
 * frame inside the restored region (finding S3-1): an interrupt that lands
 * after the restored work returns can then pre-empt the masked publication.
 * Only the mask, the two `restore` calls and the commit flag stay here; every
 * decision is a callback written in `Executable.vibe`.
 *
 * @since 1.0.0-rc.0
 */

import * as Effect from "effect/Effect"
import * as Scope from "effect/Scope"

/**
 * Forks a generation scope from `host`, loads and builds under `restore`, and
 * closes the scope on every exit that did not commit.
 */
export const ownGeneration = <A, E, R, Refused, R2, R3, Registered, R4>(
  host: Scope.Scope,
  load: (scope: Scope.Closeable) => Effect.Effect<A, E, R>,
  refused: (failure: E) => Effect.Effect<Refused, never, R2>,
  build: (success: A, scope: Scope.Closeable) => Effect.Effect<unknown, never, R3>,
  registered: (success: A, scope: Scope.Closeable) => Effect.Effect<Registered, never, R4>
): Effect.Effect<Refused | Registered, never, R | R2 | R3 | R4> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function*() {
      const scope = yield* Scope.fork(host)
      let committed = false
      return yield* Effect.gen(function*() {
        const result = yield* Effect.result(restore(load(scope)))
        if (result._tag === "Failure") return yield* refused(result.failure)
        yield* restore(build(result.success, scope))
        const published = yield* registered(result.success, scope)
        committed = true
        return published
      }).pipe(Effect.onExit((exit) => committed ? Effect.void : Scope.close(scope, exit)))
    })
  )
