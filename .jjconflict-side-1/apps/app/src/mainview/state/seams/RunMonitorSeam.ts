import { MonitorCardSchema, type MonitorCard } from "@smthrs/rpc/RunCard"
import { monitorFromJournal, type JournalRecord } from "@smthrs/gateway/RunTrace"
import { refusalOf } from "@smthrs/rpc/Refusal"
import { REPO_TOKEN } from "@smthrs/ui/command-line"
import { z } from "zod"
import type { LiveChannel } from "../../runtime/LiveChannel"

export interface RunMonitorSnapshot { readonly model?: MonitorCard; readonly error?: string }
export interface RunMonitorSnapshots {
  readonly get: (id: string) => RunMonitorSnapshot
  readonly subscribe: (id: string, notify: () => void) => () => void
}
const TraceResponseSchema = MonitorCardSchema.extend({ archive_replay: z.object({ run_id: z.string().min(1) }).optional() })

// Replay the archive with the existing gateway fold, using only recorded JSON.
// The archive carries the host's canonical run ID because URLs qualify it with
// a workspace ID. Restore the qualified identity after projecting the frame.
const replayArchive = (model: z.infer<typeof TraceResponseSchema>, at: number): MonitorCard => {
  const records: JournalRecord[] = (model.journal ?? []).map(row => ({
    runId: model.archive_replay!.run_id, sequence: row.seq, occurredAt: Date.parse(row.at),
    kind: row.type, payload: JSON.parse(row.text)
  }))
  const frame = monitorFromJournal({ runId: model.archive_replay!.run_id, flowId: model.flow, status: model.state }, records, at)
  const prices = new Map((model.attempts.at(-1)?.steps ?? []).map(step => [step.key, step] as const))
  const steps = frame.attempts[0]!.steps.map(step => {
    const metered = prices.get(step.key)
    return { ...step, ...((step.state === "completed" || step.state === "failed") && metered?.usage ? { usage: metered.usage } : {}) }
  })
  const phases = frame.attempts[0]!.phases
  const flags = model.attempts.at(-1)?.phases.filter(phase => phase.tone === "thrash") ?? []
  for (const flag of flags) {
    const phase = [...phases].reverse().find(phase => phase.title === "Ran checks" || phase.title.startsWith("Ran checks · "))
    if (phase) Object.assign(phase, { tone: "thrash", indicator: flag.indicator })
  }
  const earlier = model.attempts.slice(0, -1)
  const priced = [...earlier.flatMap(attempt => attempt.steps), ...steps]
  return MonitorCardSchema.parse({ ...frame, id: model.id, title: model.title, version: model.version,
    todo: model.todo, branch: model.branch, waits: [...new Map([...frame.waits, ...model.waits].map(wait => [wait.id, wait])).values()], journal: model.journal, replay: model.replay,
    tokens: priced.reduce((sum, step) => sum + (step.usage?.tokens ?? 0), 0),
    cost_usd: priced.reduce((sum, step) => sum + (step.usage?.cost_usd ?? 0), 0),
    attempts: [...earlier, { ...frame.attempts[0], n: model.attempts.at(-1)?.n ?? 1, run_id: model.id, steps, phases }]
  })
}

const unavailable = "Run unavailable"
const empty: RunMonitorSnapshot = {}

/**
 * Why a run list read produced no runs, in product words.
 *
 * A closed vocabulary on purpose. A refused read is not an empty one and not a
 * fixture ([#4032](https://github.com/smithersai/smithers/issues/4032)), so it
 * owes the reader a reason — but the reason is this app's own sentence, never a
 * URL, an origin, a route, an upstream status line or a server error body.
 */
export const RUN_READ_REFUSALS = {
  /** Nothing answered: the request never reached anyone who could judge it. */
  unreachable: "Could not reach your runs.",
  /** A server answered and serves no runs without a session. */
  "signed-out": "Sign in to read your runs.",
  /** A server answered and this account reaches nothing here. */
  forbidden: "This account cannot read these runs.",
  /** A server answered and refused, stating no reason this app can act on. */
  unavailable: "Runs unavailable",
  /** An answer arrived in a shape this build does not know — a gap, not an outage. */
  unreadable: "This app could not read the runs answer.",
  /**
   * This host serves runs PER REPOSITORY and the reader has picked none.
   *
   * Not an empty account and not an outage: there is no question to ask yet.
   * The hosted app used to ask the install's account-wide index instead, which
   * resolves a single-owner install binding and therefore refuses every hosted
   * reader ([#4032](https://github.com/smithersai/smithers/issues/4032)).
   */
  "no-repository": "Select a repository to read its runs."
} as const

/** One reason of {@link RUN_READ_REFUSALS}. */
export type RunReadRefusal = keyof typeof RUN_READ_REFUSALS

/**
 * The outcome of one run list read. The three cases never collapse: an empty
 * `runs` is the server saying this account has none, `refused` is nobody
 * having said, and `superseded` is the read no longer being ours to show.
 */
export type RunListRead =
  | { readonly runs: ReadonlyArray<Pick<MonitorCard, "id" | "title">> }
  | { readonly refused: RunReadRefusal }
  | { readonly superseded: true }

/**
 * The refusal a response states, read off its own evidence.
 *
 * The CODE is asked first, through the one classifier the whole stack shares
 * (`@smthrs/rpc/Refusal`), because it is what the wire actually carries and it
 * survives an edge that restates the prose and picks its own status: root's
 * native read of the deployed index came back `code: "permission"`
 * ([#4032](https://github.com/smithersai/smithers/issues/4032) receipt), and
 * that is a thing to tell the reader, not a generic outage. The status answers
 * only when no registered code did; a 404 on the index states no reason this
 * app can act on, so it does not pretend to.
 */
const refusalOfResponse = (status: number, body: unknown): RunReadRefusal => {
  switch (refusalOf({ body, status, message: "" }).code) {
    case "unauthenticated": case "unauthorized": case "session_expired": case "sign_in_required": return "signed-out"
    case "permission": case "forbidden": return "forbidden"
    default: return status === 401 ? "signed-out" : status === 403 ? "forbidden" : "unavailable"
  }
}

const RunTopicSchema = z.object({
  summary: z.object({ runId: z.string().min(1), flowId: z.string().min(1) }),
  steps: z.array(z.unknown()), events: z.array(z.unknown())
})
const RunListSchema = z.array(MonitorCardSchema.pick({ id: true, title: true }))

/** The run:<id> topic's delta is its next page: summary and steps replace the
 * view's, and its journal events extend it (the newest 1000). An unreadable
 * delta throws, so the channel takes a fresh snapshot instead. */
export const projectRunTopic = (previous: unknown, delta: unknown): unknown => {
  const next = RunTopicSchema.parse(delta)
  const prior = RunTopicSchema.safeParse(previous)
  return { ...(delta as Record<string, unknown>), events: [...(prior.success ? prior.data.events : []), ...next.events].slice(-1000) }
}

/** The authenticated run topic is authoritative. HTTP trace reads never launch
 * a flow, retry a step, or evaluate repository presentation code. */
export function createRunMonitorSeam(options: {
  readonly http: (path: string, init?: RequestInit) => Promise<Response>
  readonly live?: Pick<LiveChannel, "subscribe" | "getSnapshot"> & Partial<Pick<LiveChannel, "registerProjection">>
  readonly owner?: () => string | undefined
  /**
   * The `owner/name` whose runs these are, when this host serves runs PER
   * REPOSITORY (the hosted Cloud app). Absent for an install, whose own index
   * resolves its single bound repository server-side (#4032).
   */
  readonly repo?: () => string | undefined
  readonly view?: (id: string) => { readonly tab?: string; readonly at?: number } | undefined
}) {
  const refused: RunMonitorSnapshot = { error: unavailable }
  /**
   * The route these runs are read from: ONE REPOSITORY'S index, or the
   * install's own.
   *
   * The repository is the authority the hosted backend judges the actor
   * against (`read` on it: owner, org owner, team, collaborator, or a public
   * repository), and it is a fixed source — the selection, shape-checked
   * against {@link REPO_TOKEN} — never caller text, so no read can be aimed at
   * another origin or carry anything into the path
   * ([#4032](https://github.com/smithersai/smithers/issues/4032)).
   */
  const index = (): { readonly path: string } | { readonly refused: RunReadRefusal } => {
    if (options.repo === undefined) return { path: "/api/runs" }
    const repo = options.repo()
    if (repo === undefined || !REPO_TOKEN.test(repo)) return { refused: "no-repository" }
    const [owner, name] = repo.split("/")
    return { path: `/api/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}/monitors` }
  }
  const owners = new Map<string, string | undefined>()
  const rows = new Map<string, RunMonitorSnapshot>()
  const listeners = new Map<string, Set<() => void>>()
  const subscriptions = new Map<string, () => void>()
  const authorized = new Map<string, string | undefined>()
  const revisions = new Map<string, number>()
  const reads = new Map<string, { at?: number; journal: boolean; owner?: string; revision: number; promise: Promise<string | void> }>()
  let disposed = false
  const publish = (id: string, next: RunMonitorSnapshot, owner = options.owner?.()) => {
    if (disposed || owner !== options.owner?.()) return
    owners.set(id, owner)
    rows.set(id, next)
    for (const notify of listeners.get(id) ?? []) notify()
  }
  /*
   * A host with no live channel has no `run:<id>` topic, so the authenticated
   * monitor read is the authority instead: the route authorizes the monitor
   * command and resolves the repository server-side, so its 200 is this
   * account's grant on this run and its refusal is the refusal.
   *
   * [#4032](https://github.com/smithersai/smithers/issues/4032): this branch
   * published "Run unavailable" instead, reporting an outage for a host that
   * had simply never been asked. Where a topic DOES exist it stays the fence —
   * a pending or refused topic grants nothing and reads nothing — because a
   * server that pushes a run's frames has already said who may read them.
   */
  const authoritativeRead = (id: string, owner: string | undefined) => {
    authorized.set(id, owner)
    const view = options.view?.(id)
    void read(id, view?.at, view?.tab === "journal" || view?.at !== undefined).then(error => {
      if (error) publish(id, { error }, owner)
    })
  }
  const observe = (id: string) => {
    if (disposed || subscriptions.has(id)) return
    const owner = options.owner?.()
    const topic = `run:${id}`
    if (!options.live) {
      subscriptions.set(id, () => { authorized.delete(id) })
      authoritativeRead(id, owner)
      return
    }
    const receive = () => {
      if (owner !== options.owner?.()) return
      const value = options.live?.getSnapshot(topic)
      if (!value) return
      if (value.error) { authorized.delete(id); revisions.set(id, (revisions.get(id) ?? 0) + 1); publish(id, { error: unavailable }); return }
      // The channel creates an empty snapshot while the first authenticated
      // page is pending. Loading is not a refusal; no authority is granted
      // until a real page arrives.
      if (value.data === undefined) return
      const source = RunTopicSchema.safeParse(value.data)
      if (source.success && (source.data.summary.runId === id || source.data.summary.runId === id.slice(id.indexOf(":") + 1))) {
        authorized.set(id, owner)
        // A live update reads the monitor alone; the journal loads when its
        // tab is open or a replay position is selected.
        const view = options.view?.(id)
        void read(id, view?.at, view?.tab === "journal" || view?.at !== undefined).then(error => {
          if (error) publish(id, { error }, owner)
        })
        return
      }
      const parsed = MonitorCardSchema.safeParse(value.data)
      if (!parsed.success || parsed.data.id !== id) { authorized.delete(id); revisions.set(id, (revisions.get(id) ?? 0) + 1); publish(id, { error: unavailable }); return }
      authorized.set(id, owner)
      const view = options.view?.(id)
      // Keep the selected historical frame while its read is pending. Live
      // snapshots still validate authority, but must not replace replay data.
      if (view?.at === undefined || !snapshots.get(id).model) publish(id, { model: parsed.data })
      if (view?.tab === "journal" || view?.at !== undefined) void trace(id, view.at).then(error => {
        if (error) publish(id, { error }, owner)
      })
    }
    // Each page applies to the view; without a projector every delta would
    // cost a resubscription and a fresh snapshot.
    options.live.registerProjection?.(topic, projectRunTopic)
    subscriptions.set(id, options.live.subscribe(topic, receive))
    if (!rows.has(id) || owners.get(id) === owner) receive()
  }
  const snapshots: RunMonitorSnapshots = {
    get: id => rows.has(id) && owners.get(id) !== options.owner?.() ? refused : rows.get(id) ?? empty,
    subscribe: (id, notify) => {
      const set = listeners.get(id) ?? new Set<() => void>()
      listeners.set(id, set); set.add(notify); observe(id)
      return () => {
        set.delete(notify)
        if (set.size === 0) { revisions.set(id, (revisions.get(id) ?? 0) + 1); subscriptions.get(id)?.(); subscriptions.delete(id) }
      }
    }
  }
  const read = async (id: string, at: number | undefined, journal: boolean): Promise<string | void> => {
    if (disposed || !authorized.has(id) || authorized.get(id) !== options.owner?.()) return unavailable
    const owner = options.owner?.()
    const pending = reads.get(id)
    if (pending && pending.owner === owner && pending.at === at && pending.journal === journal && pending.revision === revisions.get(id)) return pending.promise
    const revision = (revisions.get(id) ?? 0) + 1
    revisions.set(id, revision)
    const base = index()
    /* No repository, no run: a card read of a host that scopes runs to one has nothing to ask. */
    if ("refused" in base) return unavailable
    const path = journal ? `${base.path}/${encodeURIComponent(id)}/trace${at === undefined ? "" : `?at=${at}`}` : `${base.path}/${encodeURIComponent(id)}`
    const promise = (async (): Promise<string | void> => {
      try {
        const response = await options.http(path, { method: "GET", credentials: "same-origin" })
        const parsed = response.ok ? TraceResponseSchema.safeParse(await response.json()) : undefined
        if (disposed || owner !== options.owner?.() || revisions.get(id) !== revision) return
        if (!parsed?.success || parsed.data.id !== id || (journal && parsed.data.journal === undefined) || (at !== undefined && parsed.data.replay?.at !== at)) return unavailable
        publish(id, { model: at !== undefined && parsed.data.archive_replay ? replayArchive(parsed.data, at) : parsed.data })
      } catch { if (!disposed && owner === options.owner?.() && revisions.get(id) === revision) return unavailable }
    })()
    reads.set(id, { at, journal, owner, revision, promise })
    try { return await promise } finally { if (reads.get(id)?.revision === revision) reads.delete(id) }
  }
  /** The journal tab and the replay scrubber: the monitor with its journal. */
  const trace = (id: string, at?: number): Promise<string | void> => read(id, at, true)
  /**
   * The runs this reader may read, from the server's canonical index: ONE
   * REPOSITORY'S ({@link index}) on a host that scopes runs to one, else the
   * install's account-wide one. One GET: it never launches a flow, creates a
   * workspace or wakes a machine to discover whether any run exists, and a run
   * whose host cannot be reached still arrives as a row the server marks
   * unavailable rather than being dropped from the answer.
   *
   * A live channel is not a precondition. It used to be, and the index is not
   * the topic's to grant: a composition without a channel could not list at
   * all, and {@link RunListRead} is what the caller needs instead of the one
   * `undefined` that let a REFUSAL be mistaken for an empty account
   * ([#4032](https://github.com/smithersai/smithers/issues/4032)).
   */
  const list = async (): Promise<RunListRead> => {
    if (disposed) return { superseded: true }
    const owner = options.owner?.()
    const ours = () => !disposed && owner === options.owner?.()
    const base = index()
    if ("refused" in base) return base
    let response: Response
    try {
      response = await options.http(base.path, { method: "GET", credentials: "same-origin" })
    } catch {
      return ours() ? { refused: "unreachable" } : { superseded: true }
    }
    if (!ours()) return { superseded: true }
    if (!response.ok) return { refused: refusalOfResponse(response.status, await response.json().catch(() => null)) }
    const parsed = RunListSchema.safeParse(await response.json().catch(() => null))
    if (!ours()) return { superseded: true }
    /* An answer this build cannot read proves nothing, and it is not an empty list. */
    return parsed.success ? { runs: parsed.data } : { refused: "unreadable" }
  }
  const dispose = () => {
    disposed = true
    for (const stop of subscriptions.values()) stop()
    authorized.clear(); subscriptions.clear(); rows.clear(); owners.clear(); listeners.clear(); revisions.clear(); reads.clear()
  }
  return { snapshots, trace, list, dispose }
}
