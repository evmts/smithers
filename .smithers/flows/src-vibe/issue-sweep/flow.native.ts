// E-7 (EK4402): the process environment and the random execution id
// issue-sweep/flow.vibe reads, verbatim from issue-sweep/flow.ts.
// S3-1: `restoreCall` applies `restore` to the delegate's own Effect in
// TypeScript, so an interruption that lands once the delegate returns stays
// deferred by the mask, as `yield* restore(Effect.sleep(...))` defers it.
import type { Effect } from "effect"
import { randomUUID } from "node:crypto"

export const processEnv = (): NodeJS.ProcessEnv => process.env
export const uuid = (): string => randomUUID()
export const restoreCall = <A, E, R, Args extends ReadonlyArray<unknown>>(
  restore: <AX, EX, RX>(effect: Effect.Effect<AX, EX, RX>) => Effect.Effect<AX, EX, RX>,
  f: (...args: Args) => Effect.Effect<A, E, R>,
  ...args: Args
): Effect.Effect<A, E, R> => restore(f(...args))
