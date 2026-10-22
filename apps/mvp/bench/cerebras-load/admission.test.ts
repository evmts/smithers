import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const results = new URL('./results/',import.meta.url)
test('refused invocation leaves no benchmark artifacts',()=>{
 const before=new Set(readdirSync(results))
 const env={...process.env,SMITHERS_LIVE_MODEL_TESTS:'0'}
 delete env.CHAT_MODEL
 const child=spawnSync(process.execPath,[new URL('./run.ts',import.meta.url).pathname],{env,encoding:'utf8'})
 const created=readdirSync(results).filter(name=>!before.has(name))
 try {
  assert.notEqual(child.status,0)
  assert.match(child.stderr,/opt into paid inference/)
  assert.deepEqual(created,[])
 } finally {for(const name of created) rmSync(new URL(name,results),{recursive:true,force:true})}
})
