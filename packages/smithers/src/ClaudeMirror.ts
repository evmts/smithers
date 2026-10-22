/**
 * The `smthrs claude ...` protocol the Claude Code plugin's `/workflows`
 * mirror consumes.
 *
 * The plugin does not read a database and does not know the control plane. It
 * runs one of these commands and relays the JSON, so this module is the whole
 * contract between them. {@link contract} is the wire-format major version the
 * plugin pins; bump it only when a response shape changes incompatibly.
 *
 * Two 0.x fields are gone in contract 2. `humanRequests` had no rc.0
 * counterpart — there is no question or answer RPC, and an approval parks the
 * run instead (the release policy) — and `continuedAs` described the
 * `continued` terminal status, which rc.0 does not have: a handoff round
 * settles `completed` with a lineage id (the release policy).
 *
 * Subscriptions exist because the mirror follows the runs *this* Claude
 * session started, not every run in the project. The registry never throws: a
 * missing or corrupt file degrades to no subscriptions, and writes are
 * atomic per-entry records, so unrelated updates cannot resurrect a removed
 * subscription. TTL buckets bound storage; original snapshots remain readable.
 *
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */

import type { ControlSchema } from "@smthrs/control"
import { asRecord } from "@smthrs/gateway/Diagnosis"
import { createHash, randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs"
import { dirname, join } from "node:path"
import * as NodeOutput from "./NodeOutput.ts"
import * as Project from "./Project.ts"

/**
 * The wire-format major version the plugin pins.
 *
 * @category constants
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const contract = 2

/**
 * How long a subscription stays live without being re-asserted.
 *
 * @category constants
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const subscriptionTtlMs = 24 * 60 * 60 * 1000

/**
 * Where the per-project subscription registry lives.
 *
 * @category constructors
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const subscriptionsPath = (root: string): string =>
  join(Project.stateDirectory(root), "claude-mirror-subscriptions.json")

/**
 * One session's interest in one run.
 *
 * @category models
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export interface Subscription {
  readonly runId: string
  readonly sessionId: string
  readonly updatedAtMs: number
}

/**
 * Reads the live subscriptions, dropping expired and malformed entries.
 *
 * @category getters
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const readSubscriptions = (root: string, now: number = Date.now()): ReadonlyArray<Subscription> => {
  const path = subscriptionsPath(root)
  const entries = new Map<string, { entry: Subscription; removed: boolean }>()
  const apply = (entry: unknown, removed = false): void => {
    const record = asRecord(entry)
    const runId = record["runId"]
    const sessionId = record["sessionId"]
    const updatedAtMs = record["updatedAtMs"]
    if (
      typeof runId !== "string" || typeof sessionId !== "string" || typeof updatedAtMs !== "number" ||
      !Number.isFinite(updatedAtMs)
    ) return
    const id = JSON.stringify([runId, sessionId])
    const previous = entries.get(id)
    if (
      previous &&
      (previous.entry.updatedAtMs > updatedAtMs || previous.entry.updatedAtMs === updatedAtMs && previous.removed)
    ) return
    entries.set(id, { entry: { runId, sessionId, updatedAtMs }, removed })
  }
  try {
    if (existsSync(path)) {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
      if (Array.isArray(parsed)) { for (const entry of parsed) apply(entry) }
    }
  } catch {
    // Existing persisted snapshots remain readable; a corrupt one is silent.
  }
  const bucket = Math.floor(now / subscriptionTtlMs)
  for (const time of [bucket - 1, bucket]) {
    const directory = join(`${path}.entries`, String(time))
    try {
      for (const name of readdirSync(directory)) {
        if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
        try {
          const record = asRecord(JSON.parse(readFileSync(join(directory, name), "utf8")))
          if (record["operation"] === "subscribe" || record["operation"] === "unsubscribe") {
            apply(record, record["operation"] === "unsubscribe")
          }
        } catch {
          // One damaged record must not hide unrelated subscriptions.
        }
      }
    } catch {
      // A missing bucket has no mutations to overlay.
    }
  }
  // Overlay removals before expiring records, including older snapshots.
  return [...entries.values()].flatMap(({ entry, removed }) =>
    !removed && now - entry.updatedAtMs <= subscriptionTtlMs ? [entry] : []
  ).sort((left, right) =>
    left.updatedAtMs - right.updatedAtMs || left.runId.localeCompare(right.runId) ||
    left.sessionId.localeCompare(right.sessionId)
  )
}

/** Atomically replaces only this subscription's record; failures remain silent. */
const writeSubscriptions = (root: string, entry: Subscription, operation: "subscribe" | "unsubscribe"): void => {
  const directory = `${subscriptionsPath(root)}.entries`
  const bucket = Math.floor(entry.updatedAtMs / subscriptionTtlMs)
  const id = createHash("sha256").update(JSON.stringify([entry.runId, entry.sessionId])).digest("hex")
  const path = join(directory, String(bucket), `${id}.json`)
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temporary, JSON.stringify({ ...entry, operation }), { encoding: "utf8", flag: "wx", mode: 0o600 })
    renameSync(temporary, path)
    // Old buckets cannot contain a currently valid mutation. Removing their
    // distinct paths cannot unlink a new record in either retained bucket.
    for (const name of readdirSync(directory)) {
      if (/^-?\d+$/.test(name) && Number(name) < bucket - 1) {
        rmSync(join(directory, name), { recursive: true, force: true })
      }
    }
  } catch {
    // Failing a frame over an unwritable scratch registry would be worse.
  } finally {
    try {
      unlinkSync(temporary)
    } catch { /* Already moved, or never created. */ }
  }
}

/**
 * Records this session's interest in a run. Following a run *is* subscribing,
 * so every tick re-asserts.
 *
 * @category constructors
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const subscribe = (
  root: string,
  runId: string,
  sessionId: string,
  now: number = Date.now()
): ReadonlyArray<Subscription> => {
  writeSubscriptions(root, { runId, sessionId, updatedAtMs: now }, "subscribe")
  return readSubscriptions(root, now)
}

/**
 * Drops this session's interest in a run.
 *
 * @category constructors
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const unsubscribe = (
  root: string,
  runId: string,
  sessionId: string,
  now: number = Date.now()
): ReadonlyArray<Subscription> => {
  writeSubscriptions(root, { runId, sessionId, updatedAtMs: now }, "unsubscribe")
  return readSubscriptions(root, now)
}

/**
 * One node as the mirror renders it.
 *
 * @category models
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export interface MirrorNode {
  readonly nodeId: string
  readonly label: string
  readonly phase: string
  readonly kind: string
  readonly state: "pending" | "running" | "finished" | "failed"
}

/**
 * One complete mirror frame.
 *
 * @category models
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export interface Frame {
  readonly contract: number
  readonly runId: string
  readonly status: ControlSchema.RunStatus | "unknown"
  readonly seq: number
  readonly phases: ReadonlyArray<{ readonly title: string }>
  readonly nodes: ReadonlyArray<MirrorNode>
  readonly changed: ReadonlyArray<string>
  readonly outputs: Readonly<Record<string, string>>
  readonly approvals: ReadonlyArray<{ readonly question: string | undefined; readonly approval: string | undefined }>
  readonly timedOut: boolean
}

/**
 * How much of one node's output a frame carries.
 *
 * @category constants
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const defaultMaxOutputChars = 2000

const ellipsis = "…"

/**
 * Cuts a value to at most `max` characters, counting code points.
 *
 * Slicing UTF-16 units split an astral character into a lone surrogate, and
 * the ellipsis was appended without being counted, so the result could exceed
 * the bound it exists to enforce. A bound of zero yields the empty string
 * rather than a bare ellipsis, which was itself one character over.
 */
const truncate = (value: string, max: number): string => {
  const points = [...value]
  if (points.length <= max) return value
  if (max <= 0) return ""
  return `${points.slice(0, max - 1).join("")}${ellipsis}`
}

const stateOf = (node: NodeOutput.Node): MirrorNode["state"] =>
  node.outcome === "pending" ? "running" : node.outcome === "failure" ? "failed" : "finished"

/**
 * Computes one mirror frame from a run's summary and events.
 *
 * `changed` is the set of nodes whose state moved after `afterSeq`, which is
 * what lets a blocking tick wake on real progress instead of on every model
 * token.
 *
 * @category constructors
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const frame = (
  runId: string,
  run: ControlSchema.RunSummary | undefined,
  events: ReadonlyArray<ControlSchema.ControlEvent>,
  options: {
    readonly afterSeq?: number | undefined
    readonly maxOutputChars?: number | undefined
    readonly parked?: { readonly question: string | undefined; readonly approval: string | undefined } | undefined
    readonly timedOut?: boolean | undefined
  } = {}
): Frame => {
  const afterSeq = Math.max(0, Math.floor(options.afterSeq ?? 0))
  const maxOutputChars = Math.max(0, Math.floor(options.maxOutputChars ?? defaultMaxOutputChars))
  // One run-wide projection decides both the node list and the delta. Two
  // projections cannot: `project` numbers each flow's calls within the slice
  // it is given, so a second `bash` call in a filtered tail is `bash#1` there
  // and `bash#2` here, and matching the two by id reported the first call's
  // output as the thing that changed.
  const nodes = NodeOutput.project(events)
  const changed = new Set(
    nodes.filter((node) =>
      (node.startedSequence !== undefined && node.startedSequence > afterSeq) ||
      (node.settledSequence !== undefined && node.settledSequence > afterSeq)
    ).map((node) => node.nodeId)
  )
  const outputs: Record<string, string> = {}
  for (const node of nodes) {
    if (!changed.has(node.nodeId) || node.outcome === "pending") continue
    const value = typeof node.value === "string" ? node.value : JSON.stringify(node.value) ?? ""
    outputs[node.nodeId] = truncate(value, maxOutputChars)
  }
  const phase = run?.flowId ?? "Flow"
  return {
    contract,
    runId,
    status: run?.status ?? "unknown",
    seq: events.at(-1)?.sequence ?? afterSeq,
    phases: [{ title: phase }],
    nodes: nodes.map((node) => ({
      nodeId: node.nodeId,
      label: node.nodeId,
      phase,
      kind: node.flowName,
      state: stateOf(node)
    })),
    changed: [...changed],
    outputs,
    approvals: run?.status === "waiting-approval" && options.parked !== undefined ? [options.parked] : [],
    timedOut: options.timedOut === true
  }
}

/**
 * rc.0 run statuses that mean the run is over. `continued` is not one of them:
 * it does not exist in rc.0.
 *
 * @category constants
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const terminalStatuses: ReadonlyArray<string> = ["completed", "failed", "cancelled"]

/**
 * Whether a frame's run has settled, which is what stops a blocking tick.
 *
 * @category predicates
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const isTerminal = (status: string): boolean => terminalStatuses.includes(status)

/**
 * One line of the monitor's NDJSON stream.
 *
 * @category models
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export interface Transition {
  readonly runId: string
  readonly at: number
  readonly kind: string
  readonly status?: string | undefined
  readonly nodeId?: string | undefined
}

/**
 * The events the monitor reports, which is deliberately far short of every
 * event: a mirror that printed one line per model token would be unreadable
 * and would wake the plugin continuously.
 *
 * @category constants
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const notableKinds: ReadonlySet<string> = new Set([
  "control.run.accepted",
  "control.run.running",
  "control.run.parked",
  "control.run.waiting-approval",
  "control.run.completed",
  "control.run.failed",
  "control.run.cancelled",
  "control.approval.requested",
  "control.agent.cell-call-settled",
  "control.agent.resolved"
])

/**
 * Projects one event into a monitor line, or `undefined` when it is not
 * notable.
 *
 * @category constructors
 * @since 1.0.0
 * @deprecated Use canonical flow and runs commands through Cli.makeCli; removed in #3634 phase 2.
 */
export const transition = (event: ControlSchema.ControlEvent): Transition | undefined => {
  if (!notableKinds.has(event.kind)) return undefined
  const status = event.kind.startsWith("control.run.") ? event.kind.slice("control.run.".length) : undefined
  return {
    runId: event.runId ?? "",
    at: event.occurredAt,
    kind: event.kind,
    ...(status === undefined ? {} : { status })
  }
}
