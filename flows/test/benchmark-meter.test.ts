import assert from "node:assert/strict"
import { test } from "node:test"
import { estimateMeter, type MeterSample, type MeterTrial } from "../benchmark-meter/meter.ts"

const sample = (timestamp: number, usedPercent: number, account = "codex-1", resetAt = 10_000): MeterSample => ({
  account,
  timestamp,
  usedPercent,
  resetAt
})
const trial = (
  start: number,
  end: number,
  uncached = 100,
  cached = 0,
  output = 0,
  extra: Partial<MeterTrial> = {}
): MeterTrial => ({
  account: "codex-1",
  model: "openai/gpt-6.1-sol",
  suite: "tb4",
  arm: "smithers",
  start,
  end,
  uncached,
  cached,
  output,
  ...extra
})
const close = (actual: number | null, expected: number) => {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) < 1e-9, `${actual} != ${expected}`)
}

test("independent token compositions identify all three least-squares prices", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2), sample(200, 3), sample(300, 7)], [
    trial(0, 100),
    trial(100, 200, 0, 100),
    trial(200, 300, 0, 0, 100)
  ])
  const window = result.windows[0]!
  assert.equal(window.method, "least_squares")
  assert.deepEqual(window.coefficients, { uncached: 0.02, cached: 0.01, output: 0.04 })
  assert.deepEqual(window.coefficientErrorBound, { uncached: 0.01, cached: 0.01, output: 0.01 })
  assert.deepEqual(result.cases[0], {
    suite: "tb4",
    arm: "smithers",
    count: 3,
    estimatedCount: 3,
    medianPercent: 2,
    p90Percent: 4,
    errorBoundPercent: 1
  })
  assert.deepEqual(result.flags, [])
})

test("rank-deficient intervals use the specified fixed token weights", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2), sample(200, 6)], [
    trial(0, 100, 10, 100, 10),
    trial(100, 200, 20, 200, 20)
  ])
  const window = result.windows[0]!
  assert.equal(window.method, "fixed_weights")
  close(window.coefficients!.uncached, 0.02)
  close(window.coefficients!.cached, 0.002)
  close(window.coefficients!.output, 0.16)
  close(result.cases[0]!.medianPercent, 3)
  close(result.cases[0]!.p90Percent, 4)
  close(result.cases[0]!.errorBoundPercent, 1.2)
})

test("whole-percent samples retain a nonzero error bound even with a zero observed delta", () => {
  const result = estimateMeter([sample(0, 20), sample(100, 20)], [trial(0, 100)])
  assert.equal(result.windows[0]!.method, "fixed_weights")
  assert.equal(result.cases[0]!.medianPercent, 0)
  assert.equal(result.cases[0]!.errorBoundPercent, 1)
  assert.deepEqual(result.flags, [])
})

test("a reset between samples creates a post-reset baseline instead of a negative delta", () => {
  const result = estimateMeter([
    sample(0, 90, "codex-1", 150),
    sample(100, 92, "codex-1", 150),
    sample(200, 1, "codex-1", 1000),
    sample(300, 3, "codex-1", 1000)
  ], [trial(0, 100), trial(150, 200), trial(200, 300)])
  assert.equal(result.windows.length, 2)
  assert.deepEqual(result.windows.map((window) => window.resetAt), [150, 1000])
  assert.deepEqual(result.windows[1]!.intervals.map((interval) => interval.deltaPercent), [1, 2])
  assert.equal(result.flags.some((flag) => flag.code === "reset_gap"), true)
  assert.equal(result.flags.some((flag) => flag.code === "counter_decreased"), false)
  assert.equal(result.cases[0]!.estimatedCount, 3)
})

test("known foreign session token records exclude contaminated calibration intervals", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2), sample(200, 12)], [trial(0, 100), trial(100, 200)], [{
    account: "codex-1",
    start: 100,
    end: 200,
    uncached: 400,
    cached: 0,
    output: 0
  }])
  assert.equal(result.flags.some((flag) => flag.code === "foreign_usage"), true)
  assert.equal(result.windows[0]!.intervals[1]!.included, false)
  close(result.windows[0]!.coefficients!.uncached, 0.02)
  assert.equal(result.cases[0]!.estimatedCount, 1)
  assert.equal(result.trials[1]!.percent, null)
})

test("unexplained idle deltas beyond quantization flag another session", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2), sample(200, 5)], [trial(0, 100)])
  assert.equal(result.flags.some((flag) => flag.code === "unexplained_usage"), true)
  assert.equal(result.windows[0]!.intervals[1]!.included, false)
  const quantized = estimateMeter([sample(0, 0), sample(100, 1)], [])
  assert.equal(quantized.flags.some((flag) => flag.code === "unexplained_usage"), false)
})

test("inconsistent active deltas flag leakage instead of publishing confident case estimates", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2), sample(200, 4), sample(300, 24)], [
    trial(0, 100),
    trial(100, 200),
    trial(200, 300)
  ])
  assert.equal(result.flags.some((flag) => flag.code === "unexplained_usage"), true)
  assert.equal(result.cases[0]!.estimatedCount, 0)
  assert.equal(result.cases[0]!.medianPercent, null)
})

test("accounts and suites remain separate and unordered samples give identical estimates", () => {
  const samples = [sample(0, 0), sample(100, 2), sample(0, 0, "codex-3"), sample(100, 8, "codex-3")]
  const trials = [trial(0, 100), trial(0, 100, 100, 0, 0, { account: "codex-3", suite: "swebench", arm: "codex" })]
  const result = estimateMeter(samples, trials)
  assert.deepEqual(estimateMeter(samples.toReversed(), trials), result)
  assert.deepEqual(result.cases.map((group) => [group.suite, group.arm, group.medianPercent]), [[
    "swebench",
    "codex",
    8
  ], ["tb4", "smithers", 2]])
})

test("trials crossing sample boundaries allocate by duration and require full coverage", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 1), sample(200, 2)], [
    trial(0, 200),
    trial(200, 300, 100, 0, 0, { suite: "deepswe" })
  ])
  close(result.trials[0]!.percent, 2)
  assert.equal(result.trials[1]!.percent, null)
  assert.equal(result.flags.some((flag) => flag.code === "incomplete_trial"), true)
  assert.equal(result.cases.find((group) => group.suite === "deepswe")!.estimatedCount, 0)
})

test("empty, singleton, duplicate and zero-token observations do not invent a fit", () => {
  assert.deepEqual(estimateMeter([], []).windows, [])
  assert.equal(estimateMeter([sample(0, 0)], [trial(0, 100)]).windows[0]!.method, "insufficient_data")
  const result = estimateMeter([sample(0, 0), sample(0, 0), sample(100, 0)], [trial(0, 100, 0)])
  assert.equal(result.windows[0]!.method, "insufficient_data")
  assert.equal(result.trials[0]!.percent, 0)
  assert.equal(result.cases[0]!.errorBoundPercent, 0)
})

test("instantaneous token records belong to one interval at its ending boundary", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2), sample(200, 4)], [trial(100, 100), trial(200, 200)])
  assert.deepEqual(result.windows[0]!.intervals.map((interval) => interval.tokens.uncached), [100, 100])
  assert.deepEqual(result.trials.map((item) => item.percent), [2, 2])
})

test("counter decreases without a reset and mixed models remain visible", () => {
  const result = estimateMeter([sample(0, 10), sample(100, 9), sample(200, 11)], [
    trial(0, 100),
    trial(100, 200, 100, 0, 0, { model: "other" })
  ])
  assert.equal(result.flags.some((flag) => flag.code === "counter_decreased"), true)
  assert.equal(result.flags.some((flag) => flag.code === "mixed_models"), true)
  assert.equal(result.trials[0]!.percent, null)
})

test("numeric epoch milliseconds and ISO dates are interchangeable", () => {
  const result = estimateMeter([
    { ...sample(0, 0), timestamp: "1970-01-01T00:00:00.000Z", resetAt: "1970-01-01T00:00:10.000Z" },
    sample(100, 2)
  ], [{ ...trial(0, 100), start: "1970-01-01T00:00:00.000Z" }])
  assert.equal(result.trials[0]!.percent, 2)
})

test("malformed counters, tokens, times and duplicate trial identities fail closed", () => {
  for (const bad of [-1, 101, 1.5, NaN, Infinity]) {
    assert.throws(() => estimateMeter([sample(0, bad)], []), /usedPercent/)
  }
  for (const bad of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => estimateMeter([], [trial(0, 100, bad)]), /uncached/)
  }
  assert.throws(() => estimateMeter([{ ...sample(0, 0), timestamp: "invalid" }], []), /timestamp/)
  assert.throws(() => estimateMeter([sample(100, 0, "codex-1", 50)], []), /resetAt/)
  assert.throws(() => estimateMeter([], [trial(100, 0)]), /end/)
  assert.throws(() => estimateMeter([sample(0, 0), sample(0, 1)], []), /conflicting/)
  assert.throws(
    () => estimateMeter([], [trial(0, 100, 1, 0, 0, { id: "x" }), trial(0, 100, 1, 0, 0, { id: "x" })]),
    /duplicate/
  )
  assert.throws(() => estimateMeter([], [trial(0, 100, 1, 0, 0, { account: "" })]), /account/)
  assert.throws(() => estimateMeter([{ ...sample(0, 0), timestamp: null as unknown as number }], []), /timestamp/)
})

test("nearly collinear token prices refuse an unstable inverse and use fixed weights", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2), sample(200, 3), sample(300, 4)], [
    trial(0, 100, 100_000_000, 100_000_000),
    trial(100, 200, 0, 20_000),
    trial(200, 300, 0, 0, 1)
  ])
  assert.equal(result.windows[0]!.method, "fixed_weights")
  assert.equal(Number.isFinite(result.windows[0]!.coefficients!.uncached), true)
})

test("correlated token compositions use pivoting to recover independent positive prices", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 12), sample(200, 15), sample(300, 16)], [
    trial(0, 100, 100, 100),
    trial(100, 200, 0, 10, 100),
    trial(200, 300, 0, 0, 50)
  ])
  assert.equal(result.windows[0]!.method, "least_squares")
  close(result.windows[0]!.coefficients!.uncached, 0.02)
  close(result.windows[0]!.coefficients!.cached, 0.1)
  close(result.windows[0]!.coefficients!.output, 0.02)
  assert.deepEqual(result.flags, [])
})

test("changing a future reset time early cannot imply an observed zero baseline", () => {
  const result = estimateMeter([sample(0, 10, "codex-1", 1000), sample(100, 11, "codex-1", 2000)], [trial(0, 100)])
  assert.equal(result.flags.some((flag) => flag.code === "window_changed"), true)
  assert.equal(result.windows.every((window) => window.intervals.length === 0), true)
  assert.equal(result.trials[0]!.percent, null)
})

test("different arms of the same suite produce separate summaries", () => {
  const result = estimateMeter([sample(0, 0), sample(100, 2)], [
    trial(0, 100, 100, 0, 0, { arm: "smithers" }),
    trial(0, 100, 100, 0, 0, { arm: "codex" })
  ])
  assert.deepEqual(result.cases.map((group) => [group.arm, group.medianPercent]), [["codex", 1], ["smithers", 1]])
})

test("quantized observations contain true prices within reported error bounds without leakage flags", () => {
  const samples: Array<MeterSample> = [sample(0, 0)]
  const trials: Array<MeterTrial> = []
  const truePrices = [0.003, 0.002, 0.02]
  let actualPercent = 0
  for (let index = 0; index < 20; index++) {
    const record = trial(
      index * 100,
      (index + 1) * 100,
      index % 3 === 0 ? 100 + index * 10 : 0,
      index % 3 === 1 ? 100 + index * 10 : 0,
      index % 3 === 2 ? 10 + index : 0
    )
    actualPercent += record.uncached * truePrices[0]! + record.cached * truePrices[1]! + record.output * truePrices[2]!
    samples.push(sample(record.end as number, Math.floor(actualPercent)))
    trials.push(record)
  }
  const result = estimateMeter(samples, trials)
  assert.equal(result.windows[0]!.method, "least_squares")
  assert.deepEqual(result.flags, [])
  for (let index = 0; index < trials.length; index++) {
    const record = trials[index]!
    const actual = record.uncached * truePrices[0]! + record.cached * truePrices[1]! + record.output * truePrices[2]!
    const estimate = result.trials[index]!
    assert.ok(Math.abs(estimate.percent! - actual) <= estimate.errorBoundPercent! + 1e-9)
  }
})
