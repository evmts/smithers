// S3-1: VibeLang passes a call written inside `restore(...)` by name, wrapped in a
// generator frame that keeps the fiber interruptible for one step after the call
// returns. GrantStore.ts's masked sections depend on that step not existing (a
// permit taken just before its release is installed, a journal write that
// committed just before its activation). This hatch applies `restore` to the
// delegate's own Effect, exactly as `restore(f(...args))` does in TypeScript.
import type * as Effect from "effect/Effect"

type Restore = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

export const restoreCall = <Args extends ReadonlyArray<unknown>, A, E, R>(
  restore: Restore,
  f: (...args: Args) => Effect.Effect<A, E, R>,
  ...args: Args
): Effect.Effect<A, E, R> => restore(f(...args))
