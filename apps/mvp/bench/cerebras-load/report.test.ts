import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { report } from './report.ts'
test('report derives admission duration and phase ceiling from the run', () => {
 const dir=mkdtempSync(join(tmpdir(),'load-report-'))
 try {
  writeFileSync(join(dir,'raw.json'),JSON.stringify({provider:'test',model:{},steps:[],requests:[],seconds:.25,phase:'smoke',phaseCapUsd:.1,campaignCapUsd:5,estimatedUsd:0,chargedTokens:0}))
  report(dir)
  const text=readFileSync(join(dir,'RESULTS.md'),'utf8')
  assert.match(text,/0.25s admission/)
  assert.match(text,/smoke phase ceiling: \$0.1/)
  assert.doesNotMatch(text,/load phase defaults to \$2/)
 } finally {rmSync(dir,{recursive:true,force:true})}
})
