import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reserve, quantile, summarize } from './stats.ts'
test('reserves concurrent spend before launch and refuses either ceiling', () => {
  assert.equal(reserve(1_999_900,0,100,1),null)
  assert.equal(reserve(0,4.999999,100,256),null)
  assert.ok(reserve(1_999_899,0,100,1))
})
test('interpolates quantiles and separates rate limits from failures', () => {
  assert.equal(quantile([], .99), null)
  assert.equal(quantile([10,20],.95),19.5)
  const s = summarize([{success:true,status:200,ttftMs:10,totalMs:20,outputTokens:2,estimatedUsd:.01},{success:false,status:429,estimatedUsd:0},{success:false,status:503,estimatedUsd:.02}], 2)
  assert.equal(s.errors429,1); assert.equal(s.otherErrors,1); assert.equal(s.requestsPerSecond,1.5); assert.equal(s.outputTokensPerSecond,1); assert.equal(s.totalMs.p99,20)
})
test('a lowered session allowance cannot admit an oversized reservation', () => {
  assert.equal(reserve(900,0,100,1,1000),null)
  assert.ok(reserve(899,0,100,1,1000))
})
