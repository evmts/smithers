// A-2/E-4/E-5 (D38): FlowRuns' async methods hand Promises to TypeScript callers. `runAsync` is
// the runner that settles a VibeLang program's Promise when the program exits, as the async
// function's did; `awaited` is that async function's `await`, so a rejection (or a throw while
// making the value) is an expected failure its `catch` sees. Same helpers as apps/app's
// mainview/runtime/Host.native.ts.
// E-7 (EK4402): `queueMicrotask` is a platform call VibeLang code does not make.
import { Cause, Effect } from "effect"

/** An async function's body, run for its TypeScript caller: the Promise settles when the program exits. */
export const runAsync = <A, E>(program: () => Effect.Effect<A, E>): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    Effect.runCallback(program(), {
      onExit: (exit) => exit._tag === "Success" ? resolve(exit.value) : reject(Cause.squash(exit.cause))
    })
  })

/** `await value()`: the value is made now; a rejection or a throw is an expected failure. */
export const awaited = <A>(value: () => A): Effect.Effect<Awaited<A>, unknown> =>
  Effect.tryPromise({ try: () => Promise.resolve(value()), catch: (cause) => cause })

/** `queueMicrotask(callback)`. */
export const microtask = (callback: () => void): void => queueMicrotask(callback)
