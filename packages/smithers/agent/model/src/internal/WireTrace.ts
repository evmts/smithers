/**
 * Opt-in wire trace for prompt-cache and latency debugging.
 *
 * `SMITHERS_WIRE_TRACE=<file>` appends two JSON lines per model call, paired
 * by `call`.
 *
 * The `request` line is written as the request is first signed: the route,
 * the cache key and `session-id` header (both public, never the signed
 * credential), whether a remembered affinity token rides along, a short hash
 * of the instructions, a hash and kind for each input item, and how many
 * leading input items match the previous request on the same cache key. A
 * prefix that stops growing while the transcript grows is the signature of a
 * request the provider cannot read back from cache.
 *
 * The `response` line is written when the call ends, however it ends: how it
 * ended, the HTTP status, the wire timing with every failed try, the usage,
 * the response id, the served tier, and the few response headers a provider
 * sends to identify and time a request. No request header is ever written.
 *
 * @since 1.0.0-rc.1
 * @internal
 */

import * as CanonicalJson from "../CanonicalJson.ts"
import type { Timing, Usage } from "../ModelEvent.ts"

interface Traced {
  readonly routeId: string
  readonly protocolId: string
  readonly publicHeaders: Readonly<Record<string, string>>
  readonly bodyText: string
  /** Whether the request leaves with a remembered affinity token. */
  readonly affinity?: boolean | undefined
}

interface Body {
  readonly instructions?: unknown
  readonly input?: unknown
  readonly messages?: unknown
  readonly prompt_cache_key?: unknown
}

type Item = { readonly type?: unknown; readonly role?: unknown } | null

const previous = new Map<string, ReadonlyArray<string>>()

/**
 * The trace line for one prepared request; `history` is per process.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export const line = (
  prepared: Traced,
  history: Map<string, ReadonlyArray<string>> = previous
): Record<string, unknown> => {
  // Every built-in protocol body is a JSON object; `bodyText` is its bytes.
  const body = JSON.parse(prepared.bodyText) as Body
  const list = body.input ?? body.messages
  const input: ReadonlyArray<Item> = Array.isArray(list) ? list : []
  const items = input.map((item) => CanonicalJson.shortHash(JSON.stringify(item)))
  const kinds = input.map((item) => String(item?.type ?? item?.role))
  const cacheKey = typeof body.prompt_cache_key === "string" ? body.prompt_cache_key : null
  const slot = cacheKey ?? prepared.routeId
  const before = history.get(slot) ?? []
  let common = 0
  while (common < before.length && before[common] === items[common]) common++
  history.set(slot, items)
  return {
    at: new Date().toISOString(),
    kind: "request",
    routeId: prepared.routeId,
    protocolId: prepared.protocolId,
    cacheKey,
    sessionIdHeader: prepared.publicHeaders["session-id"] ?? null,
    affinity: prepared.affinity ?? false,
    instructions: typeof body.instructions === "string" ? CanonicalJson.shortHash(body.instructions) : null,
    bytes: prepared.bodyText.length,
    items,
    kinds,
    commonPrefixItems: common,
    previousItems: before.length
  }
}

interface NodeProcess {
  readonly env: Record<string, string | undefined>
  readonly getBuiltinModule: (id: "node:fs") => { readonly appendFileSync: (path: string, data: string) => void }
}

const append = (node: NodeProcess, file: string, value: Record<string, unknown>): void => {
  try {
    node.getBuiltinModule("node:fs").appendFileSync(file, `${JSON.stringify(value)}\n`)
  } catch {
    // An unwritable trace file is the tracer's problem, not the call's.
  }
}

const traceFile = (node: NodeProcess | undefined): string | undefined => {
  const file = node?.env.SMITHERS_WIRE_TRACE
  return file === undefined || file === "" ? undefined : file
}

/** Numbers the traced calls of this process, so a call's two lines pair up. */
let calls = 0

/**
 * Appends the request line when `SMITHERS_WIRE_TRACE` names a file, and
 * answers the number that pairs it with the call's response line. Tracing
 * never fails a model call: a runtime without `process` records nothing and
 * answers nothing.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export const record = (
  prepared: Traced,
  node: NodeProcess | undefined = (globalThis as { readonly process?: NodeProcess }).process
): number | undefined => {
  const file = traceFile(node)
  if (file === undefined) return undefined
  const call = ++calls
  const { at, kind, ...request } = line(prepared)
  append(node!, file, { at, kind, call, ...request })
  return call
}

/**
 * What one call's response line is written from. Everything here is what the
 * provider answered or how long it took; nothing here is what was signed.
 *
 * @category models
 * @since 1.0.0
 */
export interface Answered {
  readonly routeId: string
  readonly protocolId: string
  /**
   * How the call ended: `settled` with a stop reason, `ended` when the stream
   * finished without one, `interrupted` when its fiber was, or the code of the
   * failure that ended it.
   */
  readonly outcome: string
  readonly stopReason?: string | undefined
  /** The answered response's HTTP status, or the last failed try's. */
  readonly status?: number | undefined
  readonly timing: Timing
  readonly usage: Usage
  readonly responseId?: string | undefined
  readonly servedTier?: string | undefined
  /** The answered response's headers; only {@link reportedHeaders} are kept. */
  readonly headers?: Readonly<Record<string, string>> | undefined
}

/**
 * The response headers a provider sends to identify a request and to say how
 * long its own side took. They are copied by name; no other header is read,
 * so a cookie or a routing token never reaches the trace.
 *
 * @category constants
 * @since 1.0.0
 */
export const reportedHeaders: ReadonlyArray<string> = [
  "x-request-id",
  "request-id",
  "cf-ray",
  "openai-processing-ms",
  "x-envoy-upstream-service-time"
]

/**
 * The trace line for one call's response.
 *
 * @category models
 * @since 1.0.0
 */
export const responseLine = (call: number, answered: Answered, at: number): Record<string, unknown> => ({
  at: new Date(at).toISOString(),
  kind: "response",
  call,
  routeId: answered.routeId,
  protocolId: answered.protocolId,
  outcome: answered.outcome,
  stopReason: answered.stopReason ?? null,
  status: answered.status ?? null,
  responseId: answered.responseId ?? null,
  servedTier: answered.servedTier ?? null,
  timing: answered.timing,
  usage: answered.usage,
  headers: Object.fromEntries(
    reportedHeaders.flatMap((name) => {
      const value = answered.headers?.[name]
      return value === undefined ? [] : [[name, value]]
    })
  )
})

/**
 * Appends the response line of a call whose request line was written; `call`
 * is what {@link record} answered, and a call that was not traced records
 * nothing. `answered` is only evaluated when a line is written.
 *
 * @category models
 * @since 1.0.0
 */
export const recordResponse = (
  call: number | undefined,
  answered: () => Answered,
  at: number,
  node: NodeProcess | undefined = (globalThis as { readonly process?: NodeProcess }).process
): void => {
  const file = traceFile(node)
  if (call === undefined || file === undefined) return
  append(node!, file, responseLine(call, answered(), at))
}
