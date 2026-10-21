import { Effect, Metric } from "effect"

/** Acquire a group for a benchmark, then release it after its work settles. */
export const usingResources = <A, E, R, B, E2, R2, R3>(
  acquire: Effect.Effect<A, E, R>,
  release: (resource: A) => Effect.Effect<void, never, R3>,
  count: number,
  body: (resources: ReadonlyArray<A>) => Effect.Effect<B, E2, R2>,
): Effect.Effect<B, E | E2, R | R2 | R3> =>
  Effect.scoped(Effect.flatMap(
    Effect.all(Array.from({ length: count }, () => Effect.acquireRelease(
      acquire.pipe(Effect.tap(() => Metric.update(acquired, 1))),
      (resource) => release(resource).pipe(Effect.ensuring(Metric.update(released, 1))),
    )), { concurrency: "unbounded" }),
    body,
  )).pipe(Effect.withSpan("bench.resources"))

const acquired = Metric.counter("bench_resources_acquired")
const released = Metric.counter("bench_resources_released")

/** Start the follower before launching the browser, and release both after the run. */
export const usingPair = <A, B, C, E, E2, E3, R, R2, R3, R4, R5>(
  first: Effect.Effect<A, E, R>, releaseFirst: (resource: A) => Effect.Effect<void, never, R4>,
  second: Effect.Effect<B, E2, R2>, releaseSecond: (resource: B) => Effect.Effect<void, never, R5>,
  body: (second: B) => Effect.Effect<C, E3, R3>,
): Effect.Effect<C, E | E2 | E3, R | R2 | R3 | R4 | R5> =>
  usingResources(first, releaseFirst, 1, () =>
    usingResources(second, releaseSecond, 1, ([resource]) => body(resource!)))
