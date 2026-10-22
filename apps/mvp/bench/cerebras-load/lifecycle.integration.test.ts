import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Deferred, Effect, Fiber, Layer } from 'effect'
import { Action, Interpreter } from '@smthrs/flow'
import { TestNodeRuntime } from '@smthrs/platform-node'
import Call, { Probe } from '../../../../.smithers/flows/cerebras-load/flow.ts'
import { executeProbe, inContext, workers } from './lifecycle.ts'
import { openBudget } from './budget.ts'

test('durable action cancellation joins the observed model work', async()=>{
 const dir=mkdtempSync(join(tmpdir(),'load-flow-'))
 let stopped=false
 try {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*(){
   const started=yield* Deferred.make<void>()
   const context=new AsyncLocalStorage<unknown>()
   const implementation=Probe.toLayer(()=>inContext(context,'request',
    Deferred.succeed(started,undefined).pipe(Effect.andThen(Effect.never),Effect.ensuring(Effect.sync(()=>{stopped=true})))
   ))
   const layer=Layer.mergeAll(implementation,Interpreter.layer(Call)).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(TestNodeRuntime.durableEngine(join(dir,'journal.sqlite'),'cerebras-load')))
   yield* Effect.gen(function*(){
    const fiber=yield* Effect.forkChild(executeProbe(0,'cancel-probe'))
    yield* Deferred.await(started)
    yield* Fiber.interrupt(fiber)
    assert.equal(stopped,true)
   }).pipe(Effect.provide(layer))
  })))
 } finally {rmSync(dir,{recursive:true,force:true})}
})

test('worker failure retains the ledger lock until settlement and evidence writes stop',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'load-drain-')),path=join(dir,'ledger.json'),evidence=join(dir,'requests.jsonl')
 const rate={input:1,output:1}
 const budget=openBudget(path,'test',rate,'load')
 let closed=false
 try {
  await Effect.runPromise(Effect.gen(function*(){
   const started=yield* Deferred.make<void>()
   const reservation=budget.reserve(100,100)!
   const survivor=Deferred.succeed(started,undefined).pipe(Effect.andThen(Effect.never),Effect.ensuring(
    Effect.sleep('10 millis').pipe(Effect.andThen(Effect.sync(()=>{
     assert.throws(()=>openBudget(path,'test',rate,'load'))
     budget.settle(reservation,10,10)
     appendFileSync(evidence,'settled\n')
    })))
   ))
   const failure=Deferred.await(started).pipe(Effect.andThen(Effect.die('injected admission failure')))
   yield* Effect.exit(workers([survivor,failure]))
   writeFileSync(join(dir,'final.json'),JSON.stringify({requests:readFileSync(evidence,'utf8')}))
   budget.close();closed=true
   assert.equal(JSON.parse(readFileSync(join(dir,'final.json'),'utf8')).requests,'settled\n')
   assert.equal(JSON.parse(readFileSync(path,'utf8')).entries[0].status,'settled')
   const next=openBudget(path,'test',rate,'load');next.close()
  }))
 } finally {if(!closed)budget.close();rmSync(dir,{recursive:true,force:true})}
})
