// node --test bench/
import assert from "node:assert/strict"
import { test } from "node:test"
import { percentile, regressions, summarize, table } from "./stats.ts"

test("percentile interpolates between the closest ranks, as NumPy's default does", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  assert.equal(percentile(sorted, 0.5), 5.5)
  assert.equal(Math.round(percentile(sorted, 0.95) * 100) / 100, 9.55)
  assert.equal(percentile(sorted, 0), 1)
  assert.equal(percentile(sorted, 1), 10)
  assert.equal(percentile([42], 0.95), 42)
  assert.throws(() => percentile([], 0.5))
})

test("summarize sorts its samples and rounds to 0.1 ms", () => {
  assert.deepEqual(summarize([30.04, 10, 20]), { n: 3, p50: 20, p95: 29, min: 10, max: 30 })
})

test("a statistic regresses only past both the relative threshold and the absolute floor", () => {
  const baseline = { a: { p50: 100, p95: 200 }, b: { p50: 4, p95: 6 } }
  const current = {
    a: { n: 10, p50: 126, p95: 240, min: 0, max: 0 }, // p50 +26% and +26 ms: flagged; p95 +20%: not
    b: { n: 10, p50: 8, p95: 6, min: 0, max: 0 }, // p50 +100% but only +4 ms: under the 5 ms floor
    c: { n: 10, p50: 999, p95: 999, min: 0, max: 0 }, // no baseline: never flagged
  }
  assert.deepEqual(regressions(current, baseline, { threshold: 0.25, floorMs: 5 }), [{ metric: "a", stat: "p50", baseline: 100, current: 126 }])
  assert.deepEqual(regressions(current, baseline, { threshold: 0.25, floorMs: 0 }), [
    { metric: "a", stat: "p50", baseline: 100, current: 126 },
    { metric: "b", stat: "p50", baseline: 4, current: 8 },
  ])
})

test("the table lists known metrics in order and marks regressions", () => {
  const summary = { n: 10, p50: 130, p95: 150, min: 120, max: 160 }
  const out = table({ "cmdk.focus": summary }, { "cmdk.focus": { p50: 100, p95: 150 } }, [
    { metric: "cmdk.focus", stat: "p50", baseline: 100, current: 130 },
  ])
  assert.match(out, /\| ⌘K to composer focused \| 10 \| 130 \| 150 \| 120 \| 160 \| \*\*\+30%\*\* \| \+0% \|/)
})
