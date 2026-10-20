import { Context, type Effect, Layer, ManagedRuntime } from "effect"

/**
 * Where an Effect meets code that takes only plain callbacks:
 * - `runSync` for a callback that must finish before it returns, such as a DOM key listener;
 * - `runPromise` for a callback that must return a Promise, such as a TanStack DB mutation handler.
 *
 * Both run on the app's one ManagedRuntime (`makeRuntime`), so a callback's Effect shares the runtime's logger,
 * tracer and metrics. The Effect must already have its services; the layer that registers the callback provides them.
 */
export class Boundary extends Context.Service<
  Boundary,
  {
    readonly runSync: <A, E>(effect: Effect.Effect<A, E>) => A
    /** Rejects with the Effect's own error. Aborting `signal` interrupts it. */
    readonly runPromise: <A, E>(effect: Effect.Effect<A, E>, options?: { readonly signal?: AbortSignal }) => Promise<A>
  }
>()("@smthrs/mvp/Boundary") {}

/**
 * The program's one runtime: `layer` built once, with `Boundary` running callbacks on this same runtime.
 * The browser makes it in `main.tsx`; a test makes its own.
 */
export const makeRuntime = <A, E>(layer: Layer.Layer<A, E, Boundary>): ManagedRuntime.ManagedRuntime<A | Boundary, E> => {
  const runtime: ManagedRuntime.ManagedRuntime<A | Boundary, E> = ManagedRuntime.make(
    layer.pipe(
      Layer.provideMerge(
        Layer.succeed(
          Boundary,
          Boundary.of({
            runSync: (effect) => runtime.runSync(effect),
            runPromise: (effect, options) => runtime.runPromise(effect, options),
          }),
        ),
      ),
    ),
  )
  return runtime
}
