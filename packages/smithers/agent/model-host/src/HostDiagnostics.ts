/**
 * Bounded guest-side diagnostics for one hosted chat turn.
 *
 * A hosted guest that stops answering writes nothing an operator can read: its
 * only durable channel is the journal, and a turn wedged before its first
 * commit never reaches it. These records go to the guest's own standard error,
 * which the sandbox keeps, so the boundary between a provider response and a
 * journal callback can be read while the turn is still stuck.
 *
 * @since 1.0.0-rc.0
 */

/**
 * The marker every record carries, so an operator can select them out of a
 * guest's log without parsing the rest of it.
 *
 * @category protocol
 * @since 1.0.0-rc.0
 */
export const HOST_DIAGNOSTIC_MARKER = "smithers.chat-host-diagnostic/v1"

/**
 * A diagnostic field value: counts, flags and short identifiers only.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type HostDiagnosticValue = number | string | boolean

/**
 * Correlation and progress fields for one record.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface HostDiagnosticFields {
  readonly [key: string]: HostDiagnosticValue
}

/**
 * Records a turn's own progress, and an operation that has not finished while
 * it still has not finished.
 *
 * @category services
 * @since 1.0.0-rc.0
 */
export interface HostDiagnostics {
  /** Records one instant of a turn's progress. */
  readonly record: (event: string, phase: string, fields?: HostDiagnosticFields) => void
  /**
   * Marks an operation started and returns its completion. Until that is
   * called the operation is reported as pending at a fixed interval, so a
   * request that never returns is visible before it is abandoned.
   */
  readonly begin: (event: string, fields?: HostDiagnosticFields) => (outcome?: HostDiagnosticFields) => void
}

/**
 * How a recorder bounds and routes its records.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface HostDiagnosticOptions {
  /** The turn these records belong to; omitted when there is none to name. */
  readonly turnId?: string
  /** Where one record line goes; the guest's standard error by default. */
  readonly write?: (line: string) => void
  /** Monotonic milliseconds. */
  readonly clock?: () => number
  /** How often an unfinished operation repeats. */
  readonly pendingMillis?: number
  /** Full start and end records per event name before only exceptional ones pass. */
  readonly detailLimit?: number
  /** An operation at least this slow is recorded past the detail limit. */
  readonly slowMillis?: number
  /** Records this recorder may write before it reports itself capped. */
  readonly limit?: number
}

// A field value is a count, a flag, or a short token. Spaces, slashes and
// anything longer are refused, so prompt text, a header, a destination or a
// credential cannot reach a log through this path by mistake.
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/

/** Keeps the fields a record may carry and counts the ones it refused. */
const safeFields = (fields: HostDiagnosticFields): {
  readonly kept: Record<string, HostDiagnosticValue>
  readonly dropped: number
} => {
  const kept: Record<string, HostDiagnosticValue> = {}
  let dropped = 0
  for (const [key, value] of Object.entries(fields)) {
    const safe = typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && SAFE_TOKEN.test(value))
    if (safe && SAFE_TOKEN.test(key)) kept[key] = value
    else dropped += 1
  }
  return { kept, dropped }
}

/**
 * Creates a bounded recorder. Nothing it writes names a host, header,
 * destination, credential or message, and its total output is bounded, so it
 * is safe to leave on for every hosted turn.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export const createHostDiagnostics = (options: HostDiagnosticOptions = {}): HostDiagnostics => {
  const write = options.write ?? ((line: string) => {
    process.stderr.write(line)
  })
  const clock = options.clock ?? (() => performance.now())
  const pendingMillis = options.pendingMillis ?? 15_000
  const detailLimit = options.detailLimit ?? 8
  const slowMillis = options.slowMillis ?? 2_000
  const limit = options.limit ?? 2_000
  const turn = options.turnId === undefined ? {} : safeFields({ turnId: options.turnId }).kept
  const started = clock()
  const counts = new Map<string, number>()
  let written = 0
  const emit = (event: string, phase: string, fields: HostDiagnosticFields): void => {
    if (written >= limit) return
    written += 1
    // The last record a recorder writes says that it stopped, so a reader
    // never mistakes a bound for a turn that went quiet.
    if (written === limit) {
      write(
        `${JSON.stringify({ diagnostic: HOST_DIAGNOSTIC_MARKER, ...turn, event: "diagnostics", phase: "capped" })}\n`
      )
      return
    }
    const { dropped, kept } = safeFields(fields)
    write(`${
      JSON.stringify({
        diagnostic: HOST_DIAGNOSTIC_MARKER,
        ...turn,
        event,
        phase,
        atMillis: Math.round(clock() - started),
        ...kept,
        ...(dropped === 0 ? {} : { droppedFields: dropped })
      })
    }\n`)
  }
  return {
    record: (event, phase, fields = {}) => emit(event, phase, fields),
    begin: (event, fields = {}) => {
      const openedAt = clock()
      const count = (counts.get(event) ?? 0) + 1
      counts.set(event, count)
      // A turn commits a batch per model frame. Recording every one of them in
      // full would bury the records that matter, so past the first few only a
      // pending, slow or failed operation is reported.
      const detailed = count <= detailLimit
      if (detailed) emit(event, "begin", fields)
      // The global timer, not node:timers': a test's clock control and this
      // module must agree on which one runs.
      const timer = setInterval(() => {
        emit(event, "pending", { ...fields, pendingMillis: Math.round(clock() - openedAt) })
      }, pendingMillis)
      // A pending report never keeps the guest process alive past its turn.
      timer.unref()
      return (outcome = {}) => {
        clearInterval(timer)
        const elapsed = Math.round(clock() - openedAt)
        if (detailed || elapsed >= slowMillis) emit(event, "end", { ...fields, ...outcome, elapsedMillis: elapsed })
      }
    }
  }
}
