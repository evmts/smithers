import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Deferred, Effect, Fiber } from 'effect'
import { inContext, workers } from './lifecycle.ts'

for (const name of ['model action', 'flow execution']) test(`${name} interruption waits for nested work to stop`, async () => {
  const context = new AsyncLocalStorage<unknown>()
  let stopped = false
  await Effect.runPromise(Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const work = Effect.gen(function* () {
      assert.equal(context.getStore(), 'request')
      yield* Deferred.succeed(started, undefined)
      yield* Effect.never
    }).pipe(Effect.ensuring(Effect.sync(() => { stopped = true })))
    const fiber = yield* Effect.forkChild(inContext(context, 'request', work))
    yield* Deferred.await(started)
    yield* Fiber.interrupt(fiber)
    assert.equal(stopped, true)
  }))
})
for (const name of ['evidence finalization', 'ledger lock release']) test(`${name} waits for surviving workers`, async () => {
  let stopped = false
  await Effect.runPromise(Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const survivor = Effect.gen(function* () {
      yield* Deferred.succeed(started, undefined)
      yield* Effect.never
    }).pipe(Effect.ensuring(Effect.sync(() => { stopped = true })))
    const failure = Deferred.await(started).pipe(Effect.andThen(Effect.die('injected worker failure')))
    yield* Effect.exit(workers([survivor, failure]))
    assert.equal(stopped, true)
  }))
})
test('observation bridge preserves successful values and typed failures',async()=>{
 const context=new AsyncLocalStorage<unknown>()
 assert.equal(await Effect.runPromise(inContext(context,'request',Effect.succeed(42))),42)
 const exit=await Effect.runPromise(Effect.exit(inContext(context,'request',Effect.fail('injected failure'))))
 assert.equal(exit._tag,'Failure')
 if(exit._tag==='Failure') assert.equal(exit.cause.reasons[0]._tag,'Fail')
})
