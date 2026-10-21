import { agentStatusTitle } from "@smthrs/ui"
import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer, Metric, Scope, Stream } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { ChatStore } from "../chat/store"
import { RUNS_SHAPE_ROUTE } from "./contract"
import { deliveriesQuery, latestQuery, needsQuery, statusesQuery } from "./queries"
import { Local, Run } from "./schema"

// Agent status on this tab (decision 0015, docs/features/agent-status.md#the-browser): the person's `runs`, synced by
// Electric and kept on the device; this tab's own rows about each question; the live queries the views read, each
// conversation's own (the home one's, and each branch's once chat opened it); and three followers that run while the
// store lives:
// - delivery: an answer recorded on any device, for a run still waiting, is dispatched to this device's engine as
//   `run/deliver` (door `sync`), one execution per question; only the device that holds the run finds it waiting;
// - the title: `(N) Smithers` while N questions need the person, through the host's `TabTitle`;
// - the record: each question the person is shown is a log line and a count, with no question text.

/** Questions that came to need the person, by `surface` (`conversation`): one per question, per tab. */
export const shown = Metric.counter("smithers_agent_status_shown", {
  description: "Questions from the agent that came to need the person, per tab",
  incremental: true,
})

/** The tab's title, as the host reads and writes it (`document.title` in a browser). */
export class TabTitle extends Context.Service<
  TabTitle,
  { readonly read: () => string; readonly write: (title: string) => void }
>()("@smthrs/mvp/status/TabTitle") {
  /** A host with no title to keep, such as a test's Node device. */
  static readonly none = TabTitle.of({ read: () => "", write: () => {} })
}

/** Where the runs sync from: ChatApi's origin, the site's own. A failed shape request waits `SyncPolicy.defaultPolicy`. */
export interface StatusConfig {
  readonly origin: string
}

type Success<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

/**
 * One conversation's agent status (decision 0015): each answer's in it, against the person's runs, and its latest
 * answer's, which the header shows while the tab shows that conversation.
 */
export interface ConversationStatus {
  readonly statuses: Success<typeof statusesQuery>
  readonly latest: Success<typeof latestQuery>
}

export class StatusStore extends Context.Service<
  StatusStore,
  {
    readonly runs: ElectricCollection.ElectricCollection<Run>
    readonly local: Collection.Collection<Local, string>
    /** The home conversation's statuses. */
    readonly statuses: Success<typeof statusesQuery>
    /** The home conversation's latest answer. */
    readonly latest: Success<typeof latestQuery>
    /** The questions that need the person, in every conversation: the title counts these. */
    readonly needs: Success<typeof needsQuery>
    /**
     * A branch conversation's status, opening its conversation in chat first: built on first use, and kept for as long
     * as the store lives. Two first uses at once may each build one; the later is kept.
     */
    readonly open: (conversationId: string) => Effect.Effect<ConversationStatus>
    /** Where the background work an action starts runs. */
    readonly scope: Scope.Scope
  }
>()("@smthrs/mvp/status/StatusStore") {
  /** The store, its followers running until the scope closes. Needs chat's store, dispatch and the tab's title. */
  static readonly layer = (config: StatusConfig) =>
    Layer.effect(
      StatusStore,
      Effect.gen(function* () {
        const scope = yield* Effect.scope
        const chat = yield* ChatStore
        const { messages } = chat
        const flows = yield* FlowDispatch
        const title = yield* TabTitle
        const runs = yield* ElectricCollection.make<Run>({
          id: "runs",
          schema: Run,
          getKey: (row) => row.id,
          syncMode: "eager",
          persist: { schemaVersion: 1 },
          shape: {
            url: `${config.origin}${RUNS_SHAPE_ROUTE}`,
            columnMapper: ElectricCollection.snakeCamelMapper(),
          },
        })
        const local = yield* Collection.local<Local, string>({ id: "status-local", schema: Local, getKey: (row) => row.id })
        const statuses = yield* statusesQuery(messages, runs, local)
        const latest = yield* latestQuery(statuses)
        const needs = yield* needsQuery(messages, runs)
        const deliveries = yield* deliveriesQuery(runs)

        // A branch's status (decision 0013 §1): its own messages against the same runs, built on first use and kept;
        // the views read it beside chat's window of the same conversation.
        const branches = new Map<string, ConversationStatus>()
        const openBranch = (conversationId: string) =>
          Effect.gen(function* () {
            const { messages: branchMessages } = yield* chat.open(conversationId)
            const branchStatuses = yield* statusesQuery(branchMessages, runs, local)
            const opened: ConversationStatus = { statuses: branchStatuses, latest: yield* latestQuery(branchStatuses) }
            branches.set(conversationId, opened)
            return opened
          }).pipe(
            Scope.provide(scope),
            // These queries' shape is fixed here; one TanStack DB can't build is a bug, as chat's own queries are.
            Effect.orDie,
          )
        const open = (conversationId: string): Effect.Effect<ConversationStatus> =>
          Effect.suspend(() => {
            const known = branches.get(conversationId)
            return known !== undefined ? Effect.succeed(known) : openBranch(conversationId)
          })

        const background = <A>(stream: Stream.Stream<A>, each: (value: A) => Effect.Effect<void>) =>
          stream.pipe(Stream.runForEach(each), Effect.forkIn(scope, { startImmediately: true }))

        // Delivery: `run/deliver` for each question this tab sees answered, under one execution id per question, so the
        // engine starts it once per device however often the rows change.
        yield* background(deliveries.rows, (rows) =>
          Effect.forEach(rows, (row) =>
            // An answered row that still needs the person holds its question and its answer (Postgres' CHECKs).
            flows.dispatch(
              "run/deliver",
              { execution: row.wait!.execution, value: row.answer!.value },
              { door: "sync", executionId: `deliver/${row.id}:${row.version}` },
            ).pipe(Effect.ignore, Effect.forkIn(scope)), { discard: true }))

        // The title, and a record of each question that came to need the person.
        const base = title.read()
        const seen = new Set<string>()
        yield* background(needs.rows, (rows) =>
          Effect.gen(function* () {
            yield* Effect.sync(() => title.write(agentStatusTitle(base, rows.length)))
            for (const row of rows.filter((need) => !seen.has(`${need.id}:${need.version}`))) {
              seen.add(`${row.id}:${row.version}`)
              yield* Metric.update(Metric.withAttributes(shown, { surface: "conversation" }), 1)
              yield* Effect.logInfo("agent.status.shown").pipe(
                Effect.annotateLogs({ runId: row.id, version: row.version!, surface: "conversation" }),
              )
            }
          }))

        return StatusStore.of({
          runs,
          local,
          statuses,
          latest,
          needs,
          open,
          scope,
        })
      }),
    )
}
