// A-2/E-4 (D38): the runner boundary that hands a Promise to TypeScript callers
// stays in TypeScript. The operator commands (Credentials, TriggerPlans, Memory,
// Triggers, Integrations) start their programs here, as their .ts sources call
// Effect.runPromise.
import { Effect } from "effect"

/** Runs an operator program for a TypeScript caller. */
export const runPromise = <A, E>(effect: Effect.Effect<A, E>, options?: Effect.RunOptions): Promise<A> =>
  Effect.runPromise(effect, options)
