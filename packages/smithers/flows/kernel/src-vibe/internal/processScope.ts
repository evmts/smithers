// S3-1: VibeLang lowers a by-name argument to `restore(...)` with a generator frame
// that adds one interruptible step after the restored program returns, so an
// interrupt landing right after a successful spawn would close the new process
// scope. This keeps ContainedSpawner.ts's mask, restore and onError exactly as
// the TypeScript wrote them; the spawn itself stays in ContainedSpawner.vibe.
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"

export const inProcessScope = <A, E, R>(
  start: () => Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<R, Scope.Scope> | Scope.Scope> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function*() {
      // A failed startup must clean up even when its caller catches the
      // error and keeps the outer scope open. One child scope contains
      // the entire pipeline, so failure of a later leg also closes all
      // earlier legs. Successful spawns retain it until their caller closes.
      const processScope = yield* Scope.fork(yield* Scope.Scope)
      return yield* restore(start().pipe(Scope.provide(processScope))).pipe(
        Effect.onError((cause) => Scope.close(processScope, Exit.failCause(cause)))
      )
    })
  )
