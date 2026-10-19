// S3-1: VibeLang passes a call written inside `restore(...)` by name, wrapped in a
// generator frame that keeps the fiber interruptible for one step after the call
// returns. Budget.ts's masked sections depend on that step not existing (a
// checked reservation is registered before an interrupt lands; a ledger write that
// returned is followed by its journal record). This hatch applies `restore` to the
// delegate's own Effect, exactly as `restore(f(...args))` does in TypeScript. It is
// the kernel twin's `restoreCall` (flows/kernel/src-vibe/internal/restoreCall.ts).
import type * as Effect from "effect/Effect"

type Restore = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

export const restoreCall = <Args extends ReadonlyArray<unknown>, A, E, R>(
  restore: Restore,
  f: (...args: Args) => Effect.Effect<A, E, R>,
  ...args: Args
): Effect.Effect<A, E, R> => restore(f(...args))
