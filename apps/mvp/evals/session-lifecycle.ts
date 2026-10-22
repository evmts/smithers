import { type Duration, Effect, Exit, Scope } from "effect"

/** Hold a scoped provider for the eval program, rather than for one request. */
export const openProviderResource = async <A, E>(resource: Effect.Effect<A, E, Scope.Scope>) => {
  const scope = Effect.runSync(Scope.make())
  const close = () => Effect.runPromise(Scope.close(scope, Exit.void))
  try {
    const value = await Effect.runPromise(Scope.provide(scope)(resource))
    return { value, close }
  } catch (error) {
    await close()
    throw error
  }
}

/** Observe dispatch while polling the answer's questions. False means the trial timed out. */
export const waitForDispatch = async <A, E, E2>(
  dispatch: Effect.Effect<A, E>,
  poll: Effect.Effect<void, E2>,
  withinMs: number,
  interval: Duration.Input = "250 millis",
): Promise<boolean> => {
  let finished = false
  // Store the exit immediately: the promise cannot reject while a poll is pending, or after a timeout.
  const run = Effect.runPromise(Effect.exit(dispatch)).then((exit) => {
    finished = true
    return exit
  })
  const deadline = Date.now() + withinMs
  while (!finished) {
    if (Date.now() > deadline) return false
    await Effect.runPromise(poll)
    await Effect.runPromise(Effect.sleep(interval))
  }
  const exit = await run
  if (Exit.isFailure(exit)) await Effect.runPromise(Effect.failCause(exit.cause))
  return true
}
