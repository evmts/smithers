// A-2/E-4 (D38): the workspace seam's own runtime and its runners stay TypeScript. Its watch
// FiberMap is made with Effect.runSync, reads and lists run on it with runPromise, and a
// watch forks with runFork; WorkspaceSeam.vibe calls these exactly where the TypeScript did.
import { Effect, FiberMap, Layer, ManagedRuntime, Scope } from "effect"

/** The seam's runtime: `ManagedRuntime.make(Layer.empty)`. */
export type WorkspaceRuntime = ManagedRuntime.ManagedRuntime<never, never>

/** The runtime and its watch map, scoped to the runtime (`Effect.runSync(FiberMap.make().pipe(Scope.provide(runtime.scope)))`). */
export const makeWorkspaceRuntime = (): { readonly runtime: WorkspaceRuntime; readonly watching: FiberMap.FiberMap<string, void> } => {
  const runtime = ManagedRuntime.make(Layer.empty)
  const watching = Effect.runSync(FiberMap.make<string, void>().pipe(Scope.provide(runtime.scope)))
  return { runtime, watching }
}

/** `runtime.runPromise(program())`. */
export const runIn = <A, E>(runtime: WorkspaceRuntime, program: () => Effect.Effect<A, E>): Promise<A> =>
  runtime.runPromise(Effect.suspend(program))

/** `runtime.runFork(program())`, unobserved. */
export const forkIn = <A, E>(runtime: WorkspaceRuntime, program: () => Effect.Effect<A, E>): void => {
  runtime.runFork(Effect.suspend(program))
}
