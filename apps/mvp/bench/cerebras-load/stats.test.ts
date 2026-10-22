import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quantile, summarize } from './stats.ts'
test('interpolates quantiles and separates rate limits from failures', () => {
  assert.equal(quantile([], .99), null)
  assert.equal(quantile([10,20],.95),19.5)
  const s = summarize([{success:true,status:200,ttftMs:10,totalMs:20,outputTokens:2,estimatedUsd:.01},{success:false,status:429,estimatedUsd:0},{success:false,status:503,estimatedUsd:.02}], 2)
  assert.equal(s.errors429,1); assert.equal(s.otherErrors,1); assert.equal(s.requestsPerSecond,1.5); assert.equal(s.outputTokensPerSecond,1); assert.equal(s.totalMs.p99,20)
})
test('decode throughput excludes missing and invalid first-token timing', () => {
  const rows = [null, undefined, NaN, Infinity, -1, 100, 101].map(ttftMs => ({success:true,ttftMs,totalMs:100,outputTokens:100,estimatedUsd:0}))
  assert.equal(summarize(rows, 1).decodeTokensPerSecondP50, null)
  assert.equal(summarize([...rows,{success:true,ttftMs:50,totalMs:100,outputTokens:1,estimatedUsd:0}],1).decodeTokensPerSecondP50,20)
})
