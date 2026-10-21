import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openBudget } from './budget.ts'
const fixture = () => { const dir=mkdtempSync(join(tmpdir(),'inference-budget-'));return {path:join(dir,'ledger.json'),close:()=>rmSync(dir,{recursive:true,force:true})} }
test('parallel admission and process restart retain unsettled spend; a second owner is refused', () => {
 const f=fixture();try {
  const b=openBudget(f.path,'p',{input:1,output:1},'load',2)
  assert.ok(b.reserve(1_000_000,0)); assert.ok(b.reserve(1_000_000,0));assert.equal(b.reserve(1,0),null)
  assert.throws(()=>openBudget(f.path,'p',{input:1,output:1},'load',2));b.close()
  const resumed=openBudget(f.path,'p',{input:1,output:1},'load',2)
  assert.equal(resumed.total(),2);assert.equal(resumed.reserve(1,0),null);resumed.close()
 }finally{f.close()}
})
test('settlement releases only known usage, while phases share the campaign ceiling',()=>{
 const f=fixture();try{
  let b=openBudget(f.path,'p',{input:1,output:1},'load',2)
  const id=b.reserve(2_000_000,0)!;b.settle(id,1_000_000,0)
  assert.throws(()=>b.settle(id,0,0));assert.equal(b.total(),1);assert.ok(b.reserve(1_000_000,0));b.close()
  b=openBudget(f.path,'p',{input:1,output:1},'eval',5)
  assert.ok(b.reserve(3_000_000,0));assert.equal(b.reserve(1,0),null);b.close()
 }finally{f.close()}
})
test('corrupt accounting and changed provider fail closed; oversize actual usage is recorded then stops',()=>{
 const f=fixture();try{
  writeFileSync(f.path,'{broken');assert.throws(()=>openBudget(f.path,'p',{input:1,output:1},'load'))
  rmSync(f.path);const b=openBudget(f.path,'p',{input:1,output:1},'load')
  const id=b.reserve(10,0)!;assert.throws(()=>b.settle(id,20,0));assert.equal(b.total(),.00002);b.close()
  assert.equal(JSON.parse(readFileSync(f.path,'utf8')).entries[0].inputTokens,20)
  assert.throws(()=>openBudget(f.path,'different',{input:1,output:1},'load'))
 }finally{f.close()}
})
