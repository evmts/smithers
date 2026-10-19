// A-2/E-4/E-5 (D38): flow-control.ts hands its control host's results to TypeScript callers as
// Promises through runners: a ManagedRuntime's start, runPromiseExit, runFork and dispose, and
// Effect.runPromise. These are those runner calls, one each, unchanged; `runAsync` and `awaited`
// are an async function's body and its `await`, as in apps/app's Host.native.ts.
// E-7 (EK4402): the Bun check and the store probe are platform calls VibeLang code does not make.
import { Control } from "@smthrs/control"
import { Effect, Fiber, type Layer, ManagedRuntime } from "effect"
import { existsSync } from "node:fs"
import { join as nodeJoin } from "node:path"

/** `Effect.runPromise(program())`: an async function's body, run for its TypeScript caller. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())

/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = <A>(value: () => A): Effect.Effect<Awaited<A>, unknown> =>
  Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause })

/** `Effect.runPromise(program())`. */
export const runPromise = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> => Effect.runPromise(program())

/**
 * `ManagedRuntime.make(layer)`, started with `runtime.runPromise(Effect.void)`; a runtime that
 * fails to start is disposed and its failure rethrown, as flow-control.ts's `open` does.
 */
export const openRuntime = async <R>(
  layer: Layer.Layer<R, never, never>
): Promise<ManagedRuntime.ManagedRuntime<R, never>> => {
  const runtime = ManagedRuntime.make(layer)
  try {
    await runtime.runPromise(Effect.void)
    return runtime
  } catch (error) {
    await runtime.dispose()
    throw error
  }
}

/** `runtime.runPromiseExit(Control.Control.pipe(Effect.flatMap(use)))`. */
export const runControl = <A>(
  runtime: ManagedRuntime.ManagedRuntime<Control.Control, never>,
  use: (control: Control.Service) => Effect.Effect<A, unknown>
) => runtime.runPromiseExit(Control.Control.pipe(Effect.flatMap(use)))

/** `runtime.runFork(program())`. */
export const runFork = <A, E>(
  runtime: ManagedRuntime.ManagedRuntime<Control.Control, never>,
  program: () => Effect.Effect<A, E, Control.Control>
): Fiber.Fiber<A, E> => runtime.runFork(program())

/** `Effect.runPromise(Fiber.await(fiber))`. */
export const awaitFiber = <A, E>(fiber: Fiber.Fiber<A, E>) => Effect.runPromise(Fiber.await(fiber))

/** `void Effect.runPromise(Fiber.interrupt(fiber))`. */
export const interrupt = (fiber: Fiber.Fiber<unknown, unknown>): void => {
  void Effect.runPromise(Fiber.interrupt(fiber))
}

/** `process.versions.bun !== undefined`. */
export const bun = (): boolean => process.versions.bun !== undefined

/** `fs.existsSync`. */
export const exists = (path: string): boolean => existsSync(path)

/** `path.join`. */
export const join = (...paths: Array<string>): string => nodeJoin(...paths)
