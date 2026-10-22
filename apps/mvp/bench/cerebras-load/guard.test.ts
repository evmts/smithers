import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, Stream } from 'effect'
import { Model, ModelEvent, ModelRequest, RequestExecutor } from '@smthrs/model'
import { HostModel } from '@smthrs/model-host'
import { openBudget } from './budget.ts'
import { guardedModel } from './guard.ts'
const request = (maxTokens?: number) => ModelRequest.ModelRequest.make({modelId:'test',system:[],messages:[ModelRequest.Message.user('hello')],tools:[],params:ModelRequest.GenerationParams.make({maxTokens})})
const fixture = () => {
 const dir=mkdtempSync(join(tmpdir(),'inference-guard-')),path=join(dir,'ledger.json')
 const budget=openBudget(path,'test',{input:1,output:1},'eval',.01)
 return {path,budget,close(){budget.close();rmSync(dir,{recursive:true,force:true})}}
}
const host = (stream: Model.Model['stream']) => HostModel.of({modelId:'test',model:Model.make({stream}),route:{prepare:()=>Effect.die('unused')}})
test('provider usage settles the durable reservation and executor retries are disabled',async()=>{
 const f=fixture();try{
  const model=guardedModel(host(()=>Stream.unwrap(Effect.map(RequestExecutor.Retries,retries=>{
   assert.equal(retries,0);return Stream.make({type:'usage' as const,inputTokens:10,outputTokens:20})
  }))),f.budget)
  await Effect.runPromise(Stream.runDrain(model.model.stream(request(256))))
  assert.equal(f.budget.total(),.00003)
  assert.equal(JSON.parse(readFileSync(f.path,'utf8')).entries[0].status,'settled')
 }finally{f.close()}
})
test('absent output cap and exhausted budget refuse before the provider is called',async()=>{
 const f=fixture();let calls=0;try{
  const model=guardedModel(host(()=>{calls++;return Stream.empty}),f.budget)
  await assert.rejects(()=>Effect.runPromise(Stream.runDrain(model.model.stream(request()))))
  await Effect.runPromise(Stream.runDrain(model.model.stream(request(256))))
  const cost=f.budget.total();assert.ok(cost>0)
  await Effect.runPromise(Stream.runDrain(model.model.stream(request(256))))
  await assert.rejects(()=>Effect.runPromise(Stream.runDrain(model.model.stream(request(256)))))
  assert.equal(calls,2);assert.equal(f.budget.total(),2*cost)
 }finally{f.close()}
})
test('a stream that fails after partial usage retains its full reservation',async()=>{
 const f=fixture();try{
  const model=guardedModel(host(()=>Stream.concat(Stream.make({type:'usage' as const,inputTokens:1,outputTokens:1}),Stream.die('stream cut'))),f.budget)
  await assert.rejects(()=>Effect.runPromise(Stream.runDrain(model.model.stream(request(256)))))
  const row=JSON.parse(readFileSync(f.path,'utf8')).entries[0]
  assert.equal(row.status,'reserved');assert.equal(row.chargedUsd,row.reservedUsd)
 }finally{f.close()}
})
test('admission programming errors remain defects rather than quota errors',async()=>{
 const f=fixture();try{
  const model=guardedModel(host(()=>Stream.empty),f.budget)
  const exit=await Effect.runPromise(Effect.exit(Stream.runDrain(model.model.stream(request()))))
  assert.equal(exit._tag,'Failure')
  if(exit._tag==='Failure') {
   const { Cause } = await import('effect')
   assert.equal(Cause.hasDies(exit.cause),true)
  }
 }finally{f.close()}
})
