import { agentStatusTitle } from "@smthrs/ui"
import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Layer, Metric, type Scope, Stream } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { ChatStore } from "../chat/store"
import { RUNS_SHAPE_ROUTE } from "./contract"
import { deliveriesQuery, latestQuery, needsQuery, statusesQuery } from "./queries"
import { Local, Run } from "./schema"

// Agent status on this tab (decision 0015, docs/features/agent-status.md#the-browser): the person's `runs`, synced by
// Electric and kept on the device; this tab's own rows about each question; the live queries the views read; and three
// followers that run while the store lives:
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

export class StatusStore extends Context.Service<
  StatusStore,
  {
    readonly runs: ElectricCollection.ElectricCollection<Run>
    readonly local: Collection.Collection<Local, string>
    readonly statuses: Success<typeof statusesQuery>
    readonly needs: Success<typeof needsQuery>
    readonly latest: Success<typeof latestQuery>
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
        const { messages } = yield* ChatStore
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
        const needs = yield* needsQuery(statuses)
        const latest = yield* latestQuery(statuses)
        const deliveries = yield* deliveriesQuery(runs)

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
            for (const row of rows) {
              const key = `${row.id}:${row.version}`
              if (seen.has(key)) continue
              seen.add(key)
              yield* Metric.update(Metric.withAttributes(shown, { surface: "conversation" }), 1)
              yield* Effect.logInfo("agent.status.shown").pipe(
                Effect.annotateLogs({ runId: row.id, version: row.version!, surface: "conversation" }),
              )
            }
          }))

        return StatusStore.of({ runs, local, statuses, needs, latest, scope })
      }),
    )
}
