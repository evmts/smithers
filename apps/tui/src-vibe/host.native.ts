// A-2/E-4 (D38): the host hands its shared ManagedRuntime's results to TypeScript callers as
// Promises and fibers: runPromise (with and without a signal), runFork, and an interrupt forked
// on the runtime. These are those runner calls, one each, unchanged from host.ts.
// E-7 (EK4402): the process id, `PATH` lookups through process.env, realpathSync and node:path
// are platform calls VibeLang code does not make; one function each, exactly as host.ts calls them.
import { Effect, Fiber, type ManagedRuntime } from "effect"
import { realpathSync } from "node:fs"
import {
  basename as nodeBasename,
  dirname as nodeDirname,
  join as nodeJoin,
  relative as nodeRelative,
  resolve as nodeResolve,
  sep as nodeSep
} from "node:path"
import * as Subprocess from "./subprocess.ts"

/** `runtime.runPromise(program())`. */
export const run = <R, A, E>(
  runtime: ManagedRuntime.ManagedRuntime<R, never>,
  program: () => Effect.Effect<A, E, R>
): Promise<A> => runtime.runPromise(program())

/** `runtime.runPromise(program(), { signal })`. */
export const runWith = <R, A, E>(
  runtime: ManagedRuntime.ManagedRuntime<R, never>,
  program: () => Effect.Effect<A, E, R>,
  signal: AbortSignal | undefined
): Promise<A> => runtime.runPromise(program(), { signal })

/** `runtime.runFork(program())`. */
export const runFork = <R, A, E>(
  runtime: ManagedRuntime.ManagedRuntime<R, never>,
  program: () => Effect.Effect<A, E, R>
): Fiber.Fiber<A, E> => runtime.runFork(program())

/** `void runtime.runFork(Fiber.interrupt(fiber))`. */
export const interrupt = <R>(runtime: ManagedRuntime.ManagedRuntime<R, never>, fiber: Fiber.Fiber<unknown, unknown>): void => {
  void runtime.runFork(Fiber.interrupt(fiber))
}

/** `process.pid`. */
export const pid = (): number => process.pid

/** `Subprocess.which(program, process.env) !== null`. */
export const has = (program: string): boolean => Subprocess.which(program, process.env) !== null

/** `fs.realpathSync`. */
export const realpath = (path: string): string => realpathSync(path)
/** `path.resolve`. */
export const resolve = (...paths: Array<string>): string => nodeResolve(...paths)
/** `path.join`. */
export const join = (...paths: Array<string>): string => nodeJoin(...paths)
/** `path.dirname`. */
export const dirname = (path: string): string => nodeDirname(path)
/** `path.basename`. */
export const basename = (path: string): string => nodeBasename(path)
/** `path.relative`. */
export const relative = (from: string, to: string): string => nodeRelative(from, to)
/** `path.sep`. */
export const sep: string = nodeSep
