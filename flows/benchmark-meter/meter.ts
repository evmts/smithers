/** Times are epoch milliseconds or ISO dates. Percentages are percentage points, not fractions. */
export type MeterTime = number | string
export interface MeterSample {
  readonly account: string
  readonly timestamp: MeterTime
  readonly usedPercent: number
  readonly resetAt: MeterTime
}
export interface TokenCounts {
  readonly uncached: number
  readonly cached: number
  readonly output: number
}
export interface ForeignUsage extends TokenCounts {
  readonly account: string
  readonly start: MeterTime
  readonly end: MeterTime
}
export interface MeterTrial extends ForeignUsage {
  readonly id?: string
  readonly model: string
  readonly suite: string
  readonly arm: string
}
export interface MeterFlag {
  readonly code:
    | "reset_gap"
    | "window_changed"
    | "foreign_usage"
    | "unexplained_usage"
    | "counter_decreased"
    | "mixed_models"
    | "incomplete_trial"
  readonly account: string
  readonly start: number
  readonly end: number
}
export interface MeterInterval {
  readonly start: number
  readonly end: number
  readonly deltaPercent: number
  readonly errorBoundPercent: number
  readonly tokens: TokenCounts
  included: boolean
}
export interface MeterWindow {
  readonly account: string
  readonly resetAt: number
  start: number
  end: number
  method: "least_squares" | "fixed_weights" | "insufficient_data"
  coefficients: TokenCounts | null
  coefficientErrorBound: TokenCounts | null
  contaminated: boolean
  readonly intervals: Array<MeterInterval>
}
export interface MeterEstimate {
  readonly version: 1
  readonly assumptions: ReadonlyArray<string>
  readonly windows: ReadonlyArray<MeterWindow>
  readonly trials: ReadonlyArray<{
    readonly id: string | null
    readonly account: string
    readonly suite: string
    readonly arm: string
    readonly percent: number | null
    readonly errorBoundPercent: number | null
  }>
  readonly cases: ReadonlyArray<{
    readonly suite: string
    readonly arm: string
    readonly count: number
    readonly estimatedCount: number
    readonly medianPercent: number | null
    readonly p90Percent: number | null
    readonly errorBoundPercent: number | null
  }>
  readonly flags: ReadonlyArray<MeterFlag>
}

type Usage = Omit<ForeignUsage, "start" | "end"> & { start: number; end: number }
type Trial = Omit<MeterTrial, "start" | "end"> & { start: number; end: number }
type Vector = [number, number, number]
const weights: Vector = [1, 0.1, 8]
const vector = (tokens: TokenCounts): Vector => [tokens.uncached, tokens.cached, tokens.output]
const counts = (value: Vector): TokenCounts => ({ uncached: value[0], cached: value[1], output: value[2] })
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function text(value: string, name: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid ${name}`)
}
function time(value: MeterTime, name: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`invalid ${name}`)
  return parsed
}
function usage<T extends ForeignUsage>(record: T): Omit<T, "start" | "end"> & { start: number; end: number } {
  text(record.account, "account")
  for (const key of ["uncached", "cached", "output"] as const) {
    if (!Number.isSafeInteger(record[key]) || record[key] < 0) throw new Error(`invalid ${key}`)
  }
  const start = time(record.start, "start")
  const end = time(record.end, "end")
  if (end < start) throw new Error("end before start")
  return { ...record, start, end }
}

/** Tokens are uniformly apportioned over a trial's elapsed time; point events belong to (start,end]. */
function fraction(record: Usage, start: number, end: number): number {
  if (record.start === record.end) return record.end > start && record.end <= end ? 1 : 0
  return Math.max(0, Math.min(record.end, end) - Math.max(record.start, start)) / (record.end - record.start)
}
function tokensIn(records: ReadonlyArray<Usage>, account: string, start: number, end: number): TokenCounts {
  const total: Vector = [0, 0, 0]
  for (const record of records) {
    if (record.account !== account) continue
    const share = fraction(record, start, end)
    const tokens = vector(record)
    for (let column = 0; column < 3; column++) total[column]! += tokens[column]! * share
  }
  return counts(total)
}

/** Invert a column-normalized Gram matrix; refuse singular or numerically unstable designs. */
function inverse(matrix: ReadonlyArray<Vector>): Array<Vector> | null {
  const augmented = matrix.map((row, index) => [...row, ...[0, 1, 2].map((column) => column === index ? 1 : 0)])
  for (let column = 0; column < 3; column++) {
    let pivot = column
    for (let row = column + 1; row < 3; row++) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row
    }
    if (Math.abs(augmented[pivot]![column]!) < 1e-8) return null
    ;[augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!]
    const divisor = augmented[column]![column]!
    for (let entry = 0; entry < 6; entry++) augmented[column]![entry]! /= divisor
    for (let row = 0; row < 3; row++) {
      if (row === column) continue
      const multiplier = augmented[row]![column]!
      for (let entry = 0; entry < 6; entry++) augmented[row]![entry]! -= multiplier * augmented[column]![entry]!
    }
  }
  const result = augmented.map((row) => row.slice(3) as Vector)
  const norm = (rows: ReadonlyArray<Vector>) =>
    Math.max(...rows.map((row) => row.reduce((sum, item) => sum + Math.abs(item), 0)))
  return norm(matrix) * norm(result) > 1e8 ? null : result
}

function fit(intervals: ReadonlyArray<MeterInterval>): {
  method: "least_squares" | "fixed_weights"
  coefficients: TokenCounts
  coefficientErrorBound: TokenCounts
} | null {
  const rows = intervals.filter((interval) => interval.included && dot(vector(interval.tokens), weights) > 0)
  if (!rows.length) return null
  const scale = [0, 1, 2].map((column) =>
    Math.sqrt(rows.reduce((sum, row) => sum + vector(row.tokens)[column]! ** 2, 0))
  ) as Vector
  const design = rows.map((row) => vector(row.tokens).map((value, column) => value / (scale[column] || 1)) as Vector)
  const gram = [0, 1, 2].map((row) =>
    [0, 1, 2].map((column) => design.reduce((sum, item) => sum + item[row]! * item[column]!, 0)) as Vector
  )
  const inv = scale.every((value) => value > 0) ? inverse(gram) : null
  if (inv) {
    const coefficients: Vector = [0, 0, 0]
    const error: Vector = [0, 0, 0]
    for (let column = 0; column < 3; column++) {
      for (let index = 0; index < rows.length; index++) {
        const influence = dot(inv[column]!, design[index]!) / scale[column]!
        coefficients[column]! += influence * rows[index]!.deltaPercent
        error[column]! += Math.abs(influence) * rows[index]!.errorBoundPercent
      }
    }
    if (coefficients.every((value) => value >= 0 && Number.isFinite(value))) {
      return { method: "least_squares", coefficients: counts(coefficients), coefficientErrorBound: counts(error) }
    }
  }
  const weighted = rows.map((row) => dot(vector(row.tokens), weights))
  const denominator = weighted.reduce((sum, value) => sum + value ** 2, 0)
  const price = rows.reduce((sum, row, index) => sum + weighted[index]! * row.deltaPercent, 0) / denominator
  const bound = rows.reduce((sum, row, index) => sum + weighted[index]! * row.errorBoundPercent, 0) / denominator
  return {
    method: "fixed_weights",
    coefficients: counts(weights.map((weight) => weight * price) as Vector),
    coefficientErrorBound: counts(weights.map((weight) => weight * bound) as Vector)
  }
}

/** Fit account/window token prices and report only cases fully covered by uncontaminated observations. */
export function estimateMeter(
  samples: ReadonlyArray<MeterSample>,
  trials: ReadonlyArray<MeterTrial>,
  foreignUsage: ReadonlyArray<ForeignUsage> = []
): MeterEstimate {
  const normalizedTrials: Array<Trial> = trials.map((record) => {
    for (const key of ["model", "suite", "arm"] as const) text(record[key], key)
    if (record.id !== undefined) text(record.id, "id")
    return usage(record)
  })
  const identities = new Set<string>()
  for (const record of normalizedTrials) {
    if (record.id === undefined) continue
    if (identities.has(record.id)) throw new Error("duplicate trial id")
    identities.add(record.id)
  }
  const foreign = foreignUsage.map(usage)
  const normalizedSamples = samples.map((sample) => {
    text(sample.account, "account")
    if (!Number.isInteger(sample.usedPercent) || sample.usedPercent < 0 || sample.usedPercent > 100) {
      throw new Error("invalid usedPercent")
    }
    const timestamp = time(sample.timestamp, "timestamp")
    const resetAt = time(sample.resetAt, "resetAt")
    if (resetAt < timestamp) throw new Error("resetAt before timestamp")
    return { ...sample, timestamp, resetAt }
  }).sort((a, b) => a.account.localeCompare(b.account) || a.timestamp - b.timestamp)
  const windows: Array<MeterWindow> = []
  const flags: Array<MeterFlag> = []
  const flag = (code: MeterFlag["code"], account: string, start: number, end: number) =>
    flags.push({ code, account, start, end })
  const windowMap = new Map<string, MeterWindow>()
  let previous: typeof normalizedSamples[number] | undefined
  for (const sample of normalizedSamples) {
    if (previous?.account === sample.account && previous.timestamp === sample.timestamp) {
      if (previous.resetAt !== sample.resetAt || previous.usedPercent !== sample.usedPercent) {
        throw new Error("conflicting samples at one timestamp")
      }
      continue
    }
    const key = JSON.stringify([sample.account, sample.resetAt])
    let window = windowMap.get(key)
    if (!window) {
      window = {
        account: sample.account,
        resetAt: sample.resetAt,
        start: sample.timestamp,
        end: sample.timestamp,
        method: "insufficient_data",
        coefficients: null,
        coefficientErrorBound: null,
        contaminated: false,
        intervals: []
      }
      windows.push(window)
      windowMap.set(key, window)
    }
    window.end = sample.timestamp
    let start: number | undefined
    let delta = 0
    if (previous?.account === sample.account) {
      if (previous.resetAt === sample.resetAt) {
        start = previous.timestamp
        delta = sample.usedPercent - previous.usedPercent
      } else if (
        previous.resetAt <= sample.timestamp && previous.resetAt > previous.timestamp &&
        sample.resetAt > previous.resetAt
      ) {
        flag("reset_gap", sample.account, previous.timestamp, previous.resetAt)
        start = previous.resetAt
        delta = sample.usedPercent
        window.start = Math.min(window.start, start)
      } else flag("window_changed", sample.account, previous.timestamp, sample.timestamp)
    }
    if (start !== undefined && sample.timestamp > start) {
      const tokens = tokensIn(normalizedTrials, sample.account, start, sample.timestamp)
      const interval: MeterInterval = {
        start,
        end: sample.timestamp,
        deltaPercent: delta,
        errorBoundPercent: 1,
        tokens,
        included: true
      }
      if (delta < 0) {
        interval.included = false
        flag("counter_decreased", sample.account, start, sample.timestamp)
      }
      if (dot(vector(tokensIn(foreign, sample.account, start, sample.timestamp)), weights) > 0) {
        interval.included = false
        window.contaminated = true
        flag("foreign_usage", sample.account, start, sample.timestamp)
      }
      if (dot(vector(tokens), weights) === 0 && delta > interval.errorBoundPercent) {
        interval.included = false
        window.contaminated = true
        flag("unexplained_usage", sample.account, start, sample.timestamp)
      }
      window.intervals.push(interval)
    }
    previous = sample
  }
  for (const window of windows) {
    const models = new Set(
      normalizedTrials.filter((record) =>
        record.account === window.account &&
        fraction(record, window.start, window.end) > 0
      ).map((record) => record.model)
    )
    if (models.size > 1) flag("mixed_models", window.account, window.start, window.end)
    const calibration = fit(window.intervals)
    if (!calibration) continue
    Object.assign(window, calibration)
    // Residuals include both the endpoint quantization and its influence on the fitted coefficients.
    const mismatched = window.intervals.filter((interval) =>
      interval.included &&
      Math.abs(interval.deltaPercent - dot(vector(interval.tokens), vector(calibration.coefficients))) >
        interval.errorBoundPercent + dot(vector(interval.tokens), vector(calibration.coefficientErrorBound)) + 1e-9
    )
    if (mismatched.length) {
      window.contaminated = true
      for (const interval of mismatched) flag("unexplained_usage", window.account, interval.start, interval.end)
      for (const interval of window.intervals) interval.included = false
    }
  }
  const estimates = normalizedTrials.map((record) => {
    let covered = 0
    let percent = 0
    let bound = 0
    for (const window of windows) {
      if (window.account !== record.account) continue
      for (const interval of window.intervals) {
        if (!interval.included) continue
        const share = fraction(record, interval.start, interval.end)
        if (share === 0) continue
        // An included interval with positive owned tokens always has a fit. Unfitted intervals
        // contain only zero-token trials, whose price and quantization contribution are both zero.
        const coefficients = window.coefficients ?? counts([0, 0, 0])
        const coefficientErrorBound = window.coefficientErrorBound ?? counts([0, 0, 0])
        covered += share
        percent += share * dot(vector(record), vector(coefficients))
        bound += share * dot(vector(record), vector(coefficientErrorBound))
      }
    }
    const complete = Math.abs(covered - 1) < 1e-9
    if (!complete) flag("incomplete_trial", record.account, record.start, record.end)
    return {
      id: record.id ?? null,
      account: record.account,
      suite: record.suite,
      arm: record.arm,
      percent: complete ? percent : null,
      errorBoundPercent: complete ? bound : null
    }
  })
  const groups = new Map<string, typeof estimates>()
  for (const record of estimates) {
    const key = JSON.stringify([record.suite, record.arm])
    groups.set(key, [...(groups.get(key) ?? []), record])
  }
  const cases = [...groups.values()].map((records) => {
    const values = records.filter((record) => record.percent !== null).map((record) => record.percent!).sort((a, b) =>
      a - b
    )
    const middle = Math.floor(values.length / 2)
    return {
      suite: records[0]!.suite,
      arm: records[0]!.arm,
      count: records.length,
      estimatedCount: values.length,
      medianPercent: values.length
        ? values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2
        : null,
      p90Percent: values.length ? values[Math.ceil(values.length * 0.9) - 1]! : null,
      errorBoundPercent: values.length
        ? Math.max(...records.filter((record) => record.percent !== null).map((record) => record.errorBoundPercent!))
        : null
    }
  }).sort((a, b) => a.suite.localeCompare(b.suite) || a.arm.localeCompare(b.arm))
  return {
    version: 1,
    assumptions: [
      "Numeric times are epoch milliseconds; percentages are percentage points.",
      "Trial token usage is uniform between start and end; boundary allocation is an assumption, not measured token timing.",
      "Error bounds cover whole-percent quantization under a constant per-account/window token price; they do not cover timing or model variation.",
      "Fixed weights (1, 0.1, 8) are assumed when token compositions cannot identify independent prices.",
      "Foreign usage proportional to benchmark tokens cannot be detected without independent session records.",
      "p90 is an empirical nearest-rank percentile; it is not a tail guarantee."
    ],
    windows,
    trials: estimates,
    cases,
    flags
  }
}
