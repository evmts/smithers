/**
 * Splits one OTLP/JSON export request into requests a collector with limits
 * accepts.
 *
 * A collector may refuse a request over a byte size or relay only its first
 * records (`OtlpRelay.serve` answers 413 past its body limit and drops records
 * past its record limit). The upstream exporter batches by record count only,
 * so a burst of large spans or log records exceeds either limit and the whole
 * batch is lost. This module repacks the batch: every record keeps its
 * resource and instrumentation scope, records keep their order, and each
 * request stays at or under both limits. A record counts as a span, a log
 * record or a metric data point, as the relay counts them; a metric with many
 * points is spread over requests, a point at a time.
 *
 * @private
 * @since 1.0.0-rc.17
 */

type Json = Record<string, unknown>

/** The three OTLP/JSON request shapes: resource list, scope list, record list. */
const shapes = [
  ["resourceSpans", "scopeSpans", "spans"],
  ["resourceLogs", "scopeLogs", "logRecords"],
  ["resourceMetrics", "scopeMetrics", "metrics"]
] as const

type Shape = typeof shapes[number]

/** Where a metric keeps its data points. */
const pointKinds = ["sum", "gauge", "histogram", "exponentialHistogram", "summary"] as const

interface Leaf {
  /** The resource and scope the record belongs to, as `resource:scope`. */
  readonly group: string
  readonly resource: number
  readonly scope: number
  /** For a metric point, the metric it belongs to, so neighbours merge back into one metric. */
  readonly metric: number | undefined
  readonly record: unknown
  readonly bytes: number
}

/**
 * The result: the requests to send in order, and how many records no request could hold.
 *
 * @private
 * @since 1.0.0-rc.17
 */
export interface Split {
  readonly requests: ReadonlyArray<Uint8Array>
  readonly oversized: number
}

const encoder = new TextEncoder()
const sizeOf = (value: unknown): number => encoder.encode(JSON.stringify(value)).byteLength

const shapeOf = (body: Json): Shape | undefined => shapes.find(([resources]) => Array.isArray(body[resources]))

const arrayAt = (value: unknown, key: string): ReadonlyArray<unknown> => {
  const found = (value as Json | null | undefined)?.[key]
  return Array.isArray(found) ? found : []
}

/** A metric's point list key and its points; a metric with neither stays one record. */
const pointsOf = (metric: unknown): readonly [string, ReadonlyArray<unknown>] | undefined => {
  for (const kind of pointKinds) {
    const points = arrayAt((metric as Json | null | undefined)?.[kind], "dataPoints")
    if (points.length > 0) return [kind, points]
  }
  return undefined
}

const withPoints = (metric: Json, kind: string, points: ReadonlyArray<unknown>): Json => ({
  ...metric,
  [kind]: { ...(metric[kind] as Json), dataPoints: points }
})

/** The request's records, flattened, each with its own encoded size. */
const leavesOf = (body: Json, [resources, scopes, records]: Shape): Array<Leaf> => {
  const leaves: Array<Leaf> = []
  arrayAt(body, resources).forEach((resource, r) =>
    arrayAt(resource, scopes).forEach((scope, s) =>
      arrayAt(scope, records).forEach((record, m) => {
        const points = records === "metrics" ? pointsOf(record) : undefined
        const group = `${r}:${s}`
        if (points === undefined) {
          leaves.push({ group, resource: r, scope: s, metric: undefined, record, bytes: sizeOf(record) + 1 })
          return
        }
        for (const point of points[1]) {
          const one = withPoints(record as Json, points[0], [point])
          leaves.push({ group, resource: r, scope: s, metric: m, record: one, bytes: sizeOf(one) + 1 })
        }
      })
    )
  )
  return leaves
}

/** A resource and scope with no records: what each group adds to a request around its records. */
const wrapperOf = (body: Json, [resources, scopes, records]: Shape, r: number, s: number): Json => {
  const resource = arrayAt(body, resources)[r] as Json
  const scope = arrayAt(resource, scopes)[s] as Json
  return { ...resource, [scopes]: [{ ...scope, [records]: [] }] }
}

/** Rebuilds one request from consecutive leaves, merging neighbouring points of one metric. */
const build = (body: Json, shape: Shape, leaves: ReadonlyArray<Leaf>): Json => {
  const [resources, scopes, records] = shape
  const out: Array<Json> = []
  let last: Leaf | undefined
  for (const leaf of leaves) {
    if (last === undefined || last.resource !== leaf.resource) {
      const resource = arrayAt(body, resources)[leaf.resource] as Json
      out.push({ ...resource, [scopes]: [] })
    }
    const resource = out[out.length - 1]!
    const scopeList = resource[scopes] as Array<Json>
    if (last === undefined || last.group !== leaf.group) {
      const scope = arrayAt(arrayAt(body, resources)[leaf.resource], scopes)[leaf.scope] as Json
      scopeList.push({ ...scope, [records]: [] })
    }
    const recordList = scopeList[scopeList.length - 1]![records] as Array<unknown>
    const previous = recordList[recordList.length - 1] as Json | undefined
    if (leaf.metric !== undefined && last?.group === leaf.group && last.metric === leaf.metric) {
      const [kind, points] = pointsOf(previous)!
      recordList[recordList.length - 1] = withPoints(previous!, kind, [...points, ...pointsOf(leaf.record)![1]])
    } else {
      recordList.push(leaf.record)
    }
    last = leaf
  }
  return { ...body, [resources]: out }
}

const parse = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}

/**
 * Repacks `bytes`, an encoded OTLP/JSON export request, into requests of at
 * most `maxBytes` encoded bytes and `maxRecords` records each. A record too
 * large for any request on its own, with its resource and scope, is left out
 * and counted in `oversized`. A body that isn't an OTLP request is one
 * request, as it was.
 *
 * @private
 * @since 1.0.0-rc.17
 */
export const split = (bytes: Uint8Array, maxBytes: number, maxRecords: number): Split => {
  const body = parse(bytes)
  const shape = typeof body === "object" && body !== null ? shapeOf(body as Json) : undefined
  if (shape === undefined) return { requests: [bytes], oversized: 0 }
  const request = body as Json
  const leaves = leavesOf(request, shape)
  // The request with no records at all: its top-level keys and brackets.
  const base = sizeOf({ ...request, [shape[0]]: [] })
  const wrappers = new Map<string, number>()
  const wrapperBytes = (leaf: Leaf): number => {
    let bytes = wrappers.get(leaf.group)
    if (bytes === undefined) {
      bytes = sizeOf(wrapperOf(request, shape, leaf.resource, leaf.scope)) + 1
      wrappers.set(leaf.group, bytes)
    }
    return bytes
  }
  const parts: Array<Array<Leaf>> = []
  let current: Array<Leaf> = []
  let groups = new Set<string>()
  let used = base
  let oversized = 0
  for (const leaf of leaves) {
    // Each group is counted as a whole wrapper, so the estimate never undercounts: a resource shared by two scopes
    // is counted twice.
    const added = leaf.bytes + (groups.has(leaf.group) ? 0 : wrapperBytes(leaf))
    // The estimate counts separators a request of one record doesn't have: measure it exactly before giving up.
    if (base + wrapperBytes(leaf) + leaf.bytes > maxBytes) {
      if (sizeOf(build(request, shape, [leaf])) > maxBytes) {
        oversized++
        continue
      }
      if (current.length > 0) parts.push(current)
      parts.push([leaf])
      current = []
      groups = new Set()
      used = base
      continue
    }
    if (current.length >= maxRecords || used + added > maxBytes) {
      parts.push(current)
      current = []
      groups = new Set()
      used = base
    }
    used += leaf.bytes + (groups.has(leaf.group) ? 0 : wrapperBytes(leaf))
    groups.add(leaf.group)
    current.push(leaf)
  }
  if (current.length > 0) parts.push(current)
  return {
    requests: parts.map((part) => encoder.encode(JSON.stringify(build(request, shape, part)))),
    oversized
  }
}
