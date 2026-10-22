import { AsyncLocalStorage } from 'node:async_hooks'
import { Effect, Fiber } from 'effect'
import Call from '../../../../.smithers/flows/cerebras-load/flow.ts'

/** Bridge the transport's callback context, joining cancellation before returning. */
export const inContext = <A, E, R>(context: AsyncLocalStorage<unknown>, row: unknown, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<R>()
    return yield* Effect.callback<A, E>(resume => {
      const fiber = context.run(row, () => Effect.runForkWith(services)(effect))
      const remove = fiber.addObserver(exit => resume(exit))
      return Effect.sync(remove).pipe(Effect.andThen(Fiber.interrupt(fiber)))
    })
  })

/** Failure interrupts and joins siblings before evidence or ledger finalization. */
export const workers = <A, E, R>(effects: Effect.Effect<A, E, R>[]) =>
  Effect.all(effects, { concurrency: 'unbounded' })

/** This CLI owns its executions: cancelling a waiter must cancel the durable run too. */
export const executeProbe = (id: number, executionId = `probe-${id}`) =>
  Call.execute({ id }, { executionId }).pipe(
    Effect.onInterrupt(() => Call.interrupt(executionId).pipe(
      Effect.orDie,
      Effect.andThen(Effect.exit(Call.execute({ id }, { executionId }))),
    )),
  )
