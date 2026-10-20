/**
 * The leader: the one worker per origin that runs the engine.
 *
 * {@link serve} waits for the engine's Web Lock, builds the engine, drives
 * every unfinished run, announces itself on the engine's channel, and then
 * answers followers' requests, runs tabs' statements on the app's shared
 * database, and forwards its engine's events until the worker ends. A leader
 * whose lock another context steals stops leading and waits for the lock
 * again.
 *
 * @since 1.0.0
 */

import { EngineStore, RunCatalogRead } from "@smthrs/engine-store"
import { Flow, FlowRuntime, RetryPolicy, WaitFor } from "@smthrs/flow"
import { Journal } from "@smthrs/journal"
import { RunStore } from "@smthrs/run-store"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import { TabChannel } from "../TabChannel.ts"
import { WebLock } from "../WebLock.ts"
import { leaderships, requests, statements, wakes } from "./Metrics.ts"
import * as Protocol from "./Protocol.ts"
import { type Service as Connection, SqlConnection, TransactionLost } from "./SqlConnection.ts"
import * as SqlProtocol from "./SqlProtocol.ts"

/**
 * The services {@link serve} reads from the engine it builds.
 *
 * @category models
 * @since 1.0.0
 */
export type Services =
  | FlowRuntime.FlowRuntime
  | EngineStore.Driver
  | RunStore.RunStore
  | Journal.Journal
  | RunCatalogRead.RunCatalogRead

/**
 * What {@link serve} runs.
 *
 * @category models
 * @since 1.0.0
 */
export interface Options {
  /** The engine's name: its Web Lock and its channel. */
  readonly name: string
  /** Every flow followers may start, by tag. Each must be registered with the engine. */
  readonly flows: ReadonlyArray<Flow.Any>
}

/** The statuses of a run that has work left. */
const unfinished = ["pending", "running", "suspended"] as const

/**
 * The tag of what a cause failed with, never its message.
 *
 * @category telemetry
 * @since 1.0.0
 */
export const failureType = (cause: Cause.Cause<unknown>): string =>
  RetryPolicy.errorTag(Cause.squash(cause)) ?? "unknown"

const isRequest = Schema.is(Protocol.Request)

/** A flow this leader was not given. */
class UnknownFlow extends Schema.TaggedError<UnknownFlow>()("@smthrs/platform-browser/UnknownFlow", {}) {}

/** A flow as the runtime's typed operations take it. */
type AnyFlow = Flow.Flow<string, Flow.AnyStructSchema, Schema.Top, Schema.Top, any>

/** Every unfinished run, collected before any is driven. */
const unfinishedRuns = Effect.gen(function*() {
  const catalog = yield* RunCatalogRead.RunCatalogRead
  const runs: Array<{ readonly runId: string; readonly flowName: string }> = []
  for (const status of unfinished) {
    let cursor: string | null = null
    do {
      const page: RunCatalogRead.RunPage = yield* catalog.listRuns({
        filters: { status },
        limit: RunCatalogRead.maximumPageSize,
        ...(cursor === null ? {} : { cursor })
      })
      runs.push(...page.runs)
      cursor = page.cursor
    } while (cursor !== null)
  }
  return runs
})

/**
 * Drives every unfinished run once, in the background: a run the previous
 * leader held, one admitted and never driven, and one whose durable timer
 * came due while no tab was open. A run parked on a later timer or on an
 * event stays parked.
 */
const wake = (flows: ReadonlyMap<string, Flow.Any>) =>
  Effect.gen(function*() {
    const driver = yield* EngineStore.Driver
    const runs = yield* unfinishedRuns.pipe(
      // The engine's own sweep still reclaims these runs, after their lease.
      Effect.tapError((error) =>
        Effect.logWarning("browser.runtime.wake").pipe(
          Effect.annotateLogs({ outcome: "unlisted", "error.type": error._tag })
        )
      ),
      Effect.orElseSucceed(() => [])
    )
    for (const run of runs) {
      const flow = flows.get(run.flowName)
      if (flow === undefined) {
        yield* Metric.update(Metric.withAttributes(wakes, { outcome: "unknown-flow" }), 1)
        yield* Effect.logWarning("browser.runtime.wake").pipe(Effect.annotateLogs({ outcome: "unknown-flow" }))
        continue
      }
      yield* driver.drive(flow, { executionId: run.runId, payload: {} }).pipe(
        Effect.exit,
        Effect.flatMap((exit) => {
          const outcome = Exit.isSuccess(exit) ? exit.value._tag.toLowerCase() : "failed"
          const failure = Exit.isFailure(exit) ? { "error.type": failureType(exit.cause) } : {}
          return Metric.update(Metric.withAttributes(wakes, { outcome }), 1).pipe(
            Effect.andThen(
              (Exit.isSuccess(exit) ? Effect.logInfo : Effect.logWarning)("browser.runtime.wake").pipe(
                Effect.annotateLogs({ outcome, ...failure })
              )
            ),
            Effect.andThen(Effect.annotateCurrentSpan({ "smithers.wake": outcome, ...failure }))
          )
        }),
        Effect.withSpan("browser.runtime.wake", {
          attributes: { "smithers.execution.id": run.runId, "smithers.flow": run.flowName }
        }),
        Effect.forkScoped
      )
    }
  })

/** Handles one request; the reply carries the poll's result, or `null`. */
const handle = (flows: ReadonlyMap<string, Flow.Any>, request: Protocol.Request) =>
  (Effect.gen(function*() {
    const flow = flows.get(request.flow) as AnyFlow | undefined
    if (flow === undefined) return yield* new UnknownFlow()
    const runtime = yield* FlowRuntime.FlowRuntime
    switch (request._tag) {
      case "Start": {
        const payload = yield* Schema.decodeUnknownEffect(Schema.toCodecJson(flow.payloadSchema))(request.payload)
        yield* runtime.execute(flow, { executionId: request.executionId, payload, discard: true })
        return null
      }
      case "Poll": {
        const row = yield* (yield* RunStore.RunStore).get(request.executionId)
        // A cancelled run records no result, so its settlement is an interrupt.
        const result = row.status === "cancelled"
          ? Option.some(new Flow.Complete({ exit: Exit.failCause(Cause.interrupt()) }))
          : yield* runtime.poll(flow, request.executionId)
        return Option.isNone(result) ? null : yield* Schema.encodeEffect(Protocol.resultCodec(flow))(result.value)
      }
      case "Cancel": {
        yield* runtime.interrupt(flow, request.executionId)
        return null
      }
      case "Signal": {
        const deferred = WaitFor.deferred(request.name)
        yield* runtime.deferredDone(deferred, {
          flowName: flow._tag,
          executionId: request.executionId,
          deferredName: deferred.name,
          exit: Exit.succeed(request.value)
        })
        return null
      }
    }
    // A flow's schemas carry the services they need with the flow's
    // registration, so the requirements erased here are satisfied there.
  }) as Effect.Effect<Schema.Json | null, unknown, FlowRuntime.FlowRuntime | RunStore.RunStore>).pipe(
    Effect.exit,
    Effect.flatMap((exit) => {
      const outcome = Exit.isSuccess(exit) ? "replied" : "refused"
      const failure = Exit.isFailure(exit) ? { "error.type": failureType(exit.cause) } : {}
      const reply: Protocol.Message = Exit.isSuccess(exit)
        ? { _tag: "Replied", client: request.client, id: request.id, result: exit.value }
        : { _tag: "Refused", client: request.client, id: request.id, error: failure["error.type"]! }
      return Metric.update(Metric.withAttributes(requests, { request: request._tag, outcome }), 1).pipe(
        Effect.andThen(
          (Exit.isSuccess(exit) ? Effect.logDebug : Effect.logWarning)("browser.runtime.request").pipe(
            Effect.annotateLogs({ request: request._tag, outcome, ...failure })
          )
        ),
        Effect.andThen(Effect.annotateCurrentSpan({ "smithers.request.outcome": outcome, ...failure })),
        Effect.as(reply)
      )
    }),
    Effect.withSpan("browser.runtime.request", {
      attributes: {
        "smithers.request": request._tag,
        "smithers.flow": request.flow,
        "smithers.execution.id": request.executionId
      }
    })
  )

/** The engine built no database for tabs: its store is not SQLite on OPFS. */
class DatabaseUnavailable extends Schema.TaggedError<DatabaseUnavailable>()(
  "@smthrs/platform-browser/DatabaseUnavailable",
  {}
) {}

/** SQLite's own result code and message for a statement it refused, never logged. */
const sqliteDetail = (error: unknown): { readonly code?: number; readonly message?: string } => {
  const cause =
    (error as { readonly reason?: { readonly cause?: { readonly code?: unknown; readonly message?: unknown } } })
      .reason?.cause
  return typeof cause?.code === "number" && typeof cause.message === "string" ?
    { code: cause.code, message: cause.message }
    : {}
}

/** How long the record of a tab's last transaction is kept: a new leader needs it seconds after the old one ends. */
const commitsKeptFor = 24 * 60 * 60 * 1000

/**
 * Creates the table of each tab's last transaction (`SqlProtocol.commits`) and
 * drops records older than a day. Without it, a statement the old leader never
 * answered is never taken as committed, and its tab runs the transaction again.
 */
const prepareCommits = (connection: Connection, leader: string) =>
  Effect.gen(function*() {
    yield* connection.run(
      leader,
      `CREATE TABLE IF NOT EXISTS ${SqlProtocol.commits} (client TEXT PRIMARY KEY, opened INTEGER NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID`,
      [],
      false
    )
    yield* connection.run(
      leader,
      `DELETE FROM ${SqlProtocol.commits} WHERE at < ?`,
      [(yield* Clock.currentTimeMillis) - commitsKeptFor],
      false
    )
  }).pipe(
    Effect.catch(() =>
      Effect.logWarning("browser.runtime.statement").pipe(Effect.annotateLogs({ outcome: "unrecorded" }))
    )
  )

/**
 * Serves tabs' statements on the app's shared database until the scope
 * closes: each request once, in the order each tab sent them, and a rollback
 * of the open transaction of a tab that ends. A statement that opens a
 * transaction is recorded inside it (`SqlProtocol.commits`), so that when a
 * statement for a transaction an earlier leader held arrives, this leader
 * answers it as committed if that leader committed the transaction with it,
 * and refuses it otherwise.
 */
const serveStatements = (name: string, database: Option.Option<Connection>) =>
  Effect.gen(function*() {
    const locks = yield* WebLock
    const port = yield* (yield* TabChannel).open(SqlProtocol.channel(name))
    const inbox = yield* port.subscribe
    const leader = crypto.randomUUID()
    if (Option.isSome(database)) yield* prepareCommits(database.value, leader)
    // The newest request number taken from each tab: a tab sends one at a
    // time, so a number already taken is a request sent again.
    const taken = new Map<string, number>()
    // A watch on each tab with an open transaction: it ends when the tab does.
    const watched = new Map<string, Fiber.Fiber<void>>()

    const watch = (client: string, open: boolean, connection: Connection) =>
      Effect.gen(function*() {
        const watching = watched.get(client)
        if (open && watching === undefined) {
          watched.set(
            client,
            yield* Effect.scoped(locks.hold(SqlProtocol.clientLock(name, client))).pipe(
              Effect.andThen(connection.abandon(client)),
              Effect.andThen(Metric.update(Metric.withAttributes(statements, { outcome: "abandoned" }), 1)),
              Effect.andThen(
                Effect.logWarning("browser.runtime.statement").pipe(
                  Effect.annotateLogs({ outcome: "abandoned" })
                )
              ),
              Effect.ensuring(Effect.sync(() => watched.delete(client))),
              Effect.forkScoped
            )
          )
        }
        if (!open && watching !== undefined) {
          watched.delete(client)
          yield* Fiber.interrupt(watching)
        }
      })

    const execute = (request: Extract<SqlProtocol.Message, { readonly _tag: "Execute" }>) =>
      Effect.gen(function*() {
        if (Option.isNone(database)) return yield* new DatabaseUnavailable()
        const connection = database.value
        const continuing = request.transaction !== null
        if (continuing && request.transaction !== leader) {
          // The transaction this statement belongs to ended with the leader that held it. Every earlier statement of it
          // left it open, so it committed only if this one committed it as that leader ended: its record says so.
          const recorded = yield* connection.run(
            request.client,
            `SELECT opened FROM ${SqlProtocol.commits} WHERE client = ?`,
            [request.client],
            false
          ).pipe(
            Effect.map(({ rows }) => (rows[0] as { readonly opened?: unknown } | undefined)?.opened),
            Effect.orElseSucceed(() => undefined)
          )
          if (request.opened !== undefined && recorded === request.opened) {
            return { rows: [], open: false, committed: true }
          }
          return yield* new TransactionLost()
        }
        const result = yield* connection.run(request.client, request.sql, request.params, continuing)
        if (result.open && !continuing) {
          // This statement opened a transaction: record it inside, so it commits with the transaction.
          yield* connection.run(
            request.client,
            `INSERT OR REPLACE INTO ${SqlProtocol.commits} (client, opened, at) VALUES (?, ?, ?)`,
            [request.client, request.id, yield* Clock.currentTimeMillis],
            true
          ).pipe(
            Effect.catch(() =>
              Effect.logWarning("browser.runtime.statement").pipe(Effect.annotateLogs({ outcome: "unrecorded" }))
            )
          )
        }
        yield* watch(request.client, result.open, connection)
        return { ...result, committed: false }
      }).pipe(
        Effect.exit,
        Effect.flatMap((exit) =>
          Effect.gen(function*() {
            const open = Option.isSome(database) && database.value.isOpen(request.client)
            if (Option.isSome(database)) yield* watch(request.client, open, database.value)
            const failure = Exit.isFailure(exit) ? failureType(exit.cause) : undefined
            const outcome = failure === undefined ?
              Exit.isSuccess(exit) && exit.value.committed ? "committed" : "executed"
              : failure === "@smthrs/platform-browser/TransactionLost" ?
              "lost"
              : "failed"
            const reply: SqlProtocol.Message = Exit.isSuccess(exit)
              ? {
                _tag: "Executed",
                client: request.client,
                id: request.id,
                leader,
                rows: exit.value.rows,
                open: exit.value.open
              }
              : {
                _tag: "Failed",
                client: request.client,
                id: request.id,
                error: failure!,
                leader,
                open,
                ...sqliteDetail(Cause.squash(exit.cause))
              }
            return yield* Metric.update(Metric.withAttributes(statements, { outcome }), 1).pipe(
              Effect.andThen(
                // A statement SQLite refused is its tab's to handle, and TanStack DB's
                // persistence expects some (a column it already added), so only a
                // lost transaction or a missing database is a warning.
                failure === undefined ?
                  Effect.void
                  : (outcome === "failed" ? Effect.logDebug : Effect.logWarning)("browser.runtime.statement").pipe(
                    Effect.annotateLogs({ outcome, "error.type": failure })
                  )
              ),
              Effect.as(reply)
            )
          })
        )
      )

    yield* Stream.fromSubscription(inbox).pipe(
      Stream.runForEach((input) => {
        const message = SqlProtocol.decode(input)
        if (message?._tag !== "Execute" || (taken.get(message.client) ?? -1) >= message.id) return Effect.void
        taken.set(message.client, message.id)
        return execute(message).pipe(
          Effect.flatMap((reply) => port.post(SqlProtocol.encode(reply))),
          Effect.forkScoped
        )
      }),
      Effect.forkScoped
    )
    yield* port.post(SqlProtocol.encode({ _tag: "Ready" }))
  })

/**
 * One leadership: waits for the engine's lock, builds `engine`, wakes
 * unfinished runs, announces itself, then serves both channels until the
 * lock is stolen, when it returns and everything it built closes.
 */
const lead = <E, R>(
  options: Options,
  engine: Layer.Layer<Services, E, R>
): Effect.Effect<void, E, R | WebLock | TabChannel | Scope.Scope> =>
  Effect.gen(function*() {
    const flows = new Map(options.flows.map((flow) => [flow._tag, flow] as const))
    const held = yield* (yield* WebLock).hold(options.name).pipe(Effect.withSpan("browser.runtime.elect"))
    yield* Metric.update(leaderships, 1)
    yield* Effect.logInfo("browser.runtime.leader").pipe(Effect.annotateLogs({ flows: flows.size }))
    const context = yield* Layer.build(engine)
    const port = yield* (yield* TabChannel).open(options.name)
    const inbox = yield* port.subscribe
    const changes = yield* Effect.flatMap(Journal.Journal, (journal) => journal.changes).pipe(
      Effect.provideContext(context)
    )
    yield* wake(flows).pipe(Effect.provideContext(context))
    yield* Stream.fromSubscription(changes).pipe(
      Stream.runForEach((entry) =>
        port.post(Protocol.encode({ _tag: "RunChanged", executionId: entry.runId, eventType: entry.eventType }))
      ),
      Effect.forkScoped
    )
    yield* serveStatements(options.name, Context.getOption(context as Context.Context<unknown>, SqlConnection))
    yield* port.post(Protocol.encode({ _tag: "Leader" }))
    yield* Stream.fromSubscription(inbox).pipe(
      Stream.runForEach((input) => {
        const message = Protocol.decode(input)
        return !isRequest(message)
          ? Effect.void
          : handle(flows, message).pipe(
            Effect.flatMap((reply) => port.post(Protocol.encode(reply))),
            Effect.provideContext(context),
            Effect.forkScoped
          )
      }),
      Effect.forkScoped
    )
    yield* held.lost
    yield* Effect.logWarning("browser.runtime.lost")
  })

/**
 * Runs the leader: waits for the engine's lock, builds `engine`, wakes
 * unfinished runs, announces itself, then serves the channel until the
 * worker ends. A failure to build the engine ends it, which releases the
 * lock to the next tab's worker. A lock another context steals ends the
 * leadership, engine and all, and the worker waits for the lock again.
 *
 * @category running
 * @since 1.0.0
 */
export const serve = <E, R>(
  options: Options,
  engine: Layer.Layer<Services, E, R>
): Effect.Effect<never, E, R | WebLock | TabChannel> => Effect.forever(Effect.scoped(lead(options, engine)))
