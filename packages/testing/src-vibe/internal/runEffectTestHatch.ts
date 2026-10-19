// A-2, E-5 (D38): a runner boundary that returns a Promise to TypeScript callers
// (ManagedRuntime.runFork, runPromise, dispose) stays in TypeScript.
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import type * as Scope from "effect/Scope"
import type { Body } from "./TestEffectRunner.vibe"

const evaluate = <A, E, R>(body: Body<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.suspend(() => typeof body === "function" ? body() : body)

export const runEffectTest = async <R, E, A, E2>(
  layer: Layer.Layer<R, E>,
  base: Layer.Layer<never>,
  body: Body<A, E2, R | Scope.Scope>,
  signal: AbortSignal
): Promise<A> => {
  const runtime = ManagedRuntime.make(Layer.mergeAll(layer, base))
  const fiber = runtime.runFork(Effect.scoped(evaluate(body)))
  const onAbort = () => {
    runtime.runFork(Fiber.interrupt(fiber))
  }
  signal.addEventListener("abort", onAbort, { once: true })
  try {
    return await runtime.runPromise(Fiber.join(fiber))
  } finally {
    signal.removeEventListener("abort", onAbort)
    await runtime.dispose()
  }
}
