/**
 * A durable outbox for TanStack DB writes, through
 * `@tanstack/offline-transactions`, as an Effect service.
 *
 * A write is an offline transaction: its optimistic rows show at once, the
 * transaction is stored durably (IndexedDB in a browser) before anything is
 * sent, and the library sends it with its own backoff, one at a time in the
 * order written, across reloads and restarts. Each named mutation is an
 * Effect; this module turns its typed failures into the library's retry
 * decisions:
 *
 * - `Refused`: the server refused the write for good; it is never sent again
 *   and its optimistic rows roll back;
 * - `Retry`: the write didn't get through (the network, a 5xx, a 429, a
 *   deadline); the library sends it again after its backoff, 1 second
 *   doubling to 60, jittered, or at once on `retryNow` or the browser coming
 *   back online;
 * - a defect is never retried, and is logged.
 *
 * Only a program that leads the outbox, with durable storage, admits a write.
 * `transact` never takes the library's online-only path for followers; it
 * fails with `NotAdmitted` instead. Who leads is injected (`leader`); without
 * one, the library elects with its own Web Lock.
 *
 * The host supplies the library's entry point and storage as arguments
 * (`startOfflineExecutor`, `IndexedDBAdapter`), so this module imports and
 * runs anywhere Effect does.
 *
 * @since 0.2.0
 */

import type {
  LeaderElection,
  OfflineConfig,
  OfflineExecutor,
  OnlineDetector,
  StorageAdapter
} from "@tanstack/offline-transactions"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Option from "effect/Option"
import type * as Scope from "effect/Scope"
import type * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"
import * as Tracer from "effect/Tracer"
import type { Collection } from "./Collection.ts"
import { type MutationRefused, TransactionFailed } from "./internal/model.ts"

/**
 * The server refused a write for good: it is never sent again, and its
 * optimistic rows roll back. `status` is the HTTP status, when there was one.
 *
 * @category errors
 * @since 0.2.0
 */
export class Refused extends Data.TaggedError("Refused")<{ readonly status?: number }> {}

/**
 * A write didn't get through and is sent again after the backoff: `status` is
 * the HTTP status (5xx, 408, 429), or absent for the network or a deadline.
 *
 * @category errors
 * @since 0.2.0
 */
export class Retry extends Data.TaggedError("Retry")<{ readonly status?: number }> {}

/**
 * The outbox didn't take a write, so nothing was stored or sent and its rows
 * rolled back:
 * - `follower`: another tab leads, including leadership lost before persistence;
 * - `storage`: the outbox's storage failed to store it.
 *
 * @category errors
 * @since 0.2.0
 */
export class NotAdmitted extends Data.TaggedError("NotAdmitted")<{
  readonly reason: "follower" | "storage"
}> {}

/**
 * A named mutation: sends the rows of one write. `idempotencyKey` is the same
 * on every attempt, so the server can tell a resend from a new write.
 *
 * @category models
 * @since 0.2.0
 */
export type Mutation<R> = (params: {
  readonly rows: ReadonlyArray<unknown>
  readonly idempotencyKey: string
}) => Effect.Effect<void, Refused | Retry, R>

/**
 * Who leads the outbox: the library's `LeaderElection`, such as its own
 * `WebLocksLeader`, or the host's tab leader.
 *
 * @category models
 * @since 0.2.0
 */
export type Leader = LeaderElection

/**
 * Whether the network is there, and the signal to send now: the library's
 * `OnlineDetector`.
 *
 * @category models
 * @since 0.2.0
 */
export type Online = OnlineDetector

/**
 * What `layer` starts the outbox with.
 *
 * @category models
 * @since 0.2.0
 */
export interface Options<R> {
  /** The library's entry point: `startOfflineExecutor` from `@tanstack/offline-transactions`. */
  readonly start: (config: OfflineConfig) => OfflineExecutor
  /**
   * The collections writes may change, keyed by a name that never changes: a stored write names its collection by
   * this key, so a write queued by one version of a program is restored into the same collection by the next.
   */
  readonly collections: Readonly<Record<string, Collection<any, any, any>>>
  /** Where writes are stored: `new IndexedDBAdapter(...)` in a browser. */
  readonly storage: StorageAdapter
  /** Who leads. Defaults to the library's election: `WebLocksLeader` where Web Locks exist. */
  readonly leader?: Leader
  /** The network detector: the library's `WebOnlineDetector` in a browser, `Online.always()` elsewhere. */
  readonly online: Online
  readonly mutations: Readonly<Record<string, Mutation<R>>>
}

/**
 * The outbox's state, as `status` reports it:
 * - `leader`: this program leads the outbox, so it admits and sends writes;
 * - `failing`: the last send didn't get through, on the `network` or at the
 *   `server`; null once one does.
 *
 * @category models
 * @since 0.2.0
 */
export interface Status {
  readonly leader: boolean
  readonly failing: null | "network" | "server"
}

/**
 * A write the outbox took. Its rows show at once.
 *
 * @category models
 * @since 0.2.0
 */
export interface Write {
  readonly id: string
  /** Succeeds once the write is stored durably; fails with `NotAdmitted` if the storage refused it. */
  readonly admitted: Effect.Effect<void, NotAdmitted>
  /** Succeeds once the mutation succeeded; fails with `TransactionFailed` when the write rolled back. */
  readonly settled: Effect.Effect<void, TransactionFailed>
}

/**
 * The outbox.
 *
 * @category models
 * @since 0.2.0
 */
export interface Service {
  /**
   * Writes through mutation `name`: `mutate` runs at once, synchronously, inside the write, so its inserts, updates
   * and deletes show as optimistic rows until the write settles. Fails with `NotAdmitted` when this program doesn't
   * lead the outbox, and with `mutate`'s `MutationRefused`, after rolling the write back, when a change is refused.
   * The current span, if any, is stored with the write, and every send links to it.
   */
  readonly transact: (
    name: string,
    ids: { readonly idempotencyKey: string },
    mutate: Effect.Effect<void, MutationRefused>
  ) => Effect.Effect<Write, NotAdmitted | MutationRefused>
  /** The outbox's state now, then each change. */
  readonly status: Stream.Stream<Status>
  /** Sends every waiting write now instead of waiting out its backoff. */
  readonly retryNow: Effect.Effect<void>
}

/**
 * The outbox writes are made through.
 *
 * @category services
 * @since 0.2.0
 */
export class Outbox extends Context.Service<Outbox, Service>()("@smthrs/effect-tanstack-db/Outbox") {}

/**
 * Each send, by `name` and `outcome`: `sent`, `retry`, `refused` or `defect`.
 *
 * @category metrics
 * @since 0.2.0
 */
export const attempts = Metric.counter("outbox_attempts", {
  description: "Sends of outbox writes, by mutation name and outcome",
  incremental: true
})

/**
 * Writes the server refused, by `name` and `status`.
 *
 * @category metrics
 * @since 0.2.0
 */
export const refused = Metric.counter("outbox_refused", {
  description: "Outbox writes the server refused for good, by mutation name and status",
  incremental: true
})

/**
 * Milliseconds from a write to its mutation succeeding, by `name`.
 *
 * @category metrics
 * @since 0.2.0
 */
export const queuedMs = Metric.histogram("outbox_queued_ms", {
  description: "Milliseconds from an outbox write to its mutation succeeding",
  boundaries: Metric.exponentialBoundaries({ start: 50, factor: 2, count: 14 })
})

/**
 * Times this program became, or stopped being, the outbox's leader, by `leader`.
 *
 * @category metrics
 * @since 0.2.0
 */
export const leaderChanges = Metric.counter("outbox_leader_changes", {
  description: "Times this program took or lost the outbox's leadership",
  incremental: true
})

// The library's storage key for a write (`OutboxManager`).
const KEY_PREFIX = "tx:"

// The error names a mutation's failure becomes. Their messages are fixed, so the library's substring rules never read
// anything else, and `shouldRetry` decides on the name alone.
const RETRY = "OutboxRetry"

const thrown = (name: string, message: string): Error => Object.assign(new Error(message), { name })

/** What a write carries besides its rows: when it was made, and the span it was made in. */
interface Metadata {
  readonly queuedAt: number
  readonly trace?: { readonly traceId: string; readonly spanId: string }
}

/**
 * Starts the outbox and waits until it has loaded the writes stored earlier,
 * restored their rows, and asked to lead. Each mutation runs with the services
 * of the fiber that builds the layer. Each send is a span, `outbox.send`, with
 * `name`, `attempt` and `outcome`, linked to the span the write was made in,
 * and is counted in `attempts`. The outbox stops when the layer closes.
 *
 * @category layers
 * @since 0.2.0
 */
export const layer = <R>(options: Options<R>): Layer.Layer<Outbox, never, R> =>
  Layer.effect(
    Outbox,
    Effect.gen(function*() {
      const context = yield* Effect.context<R>()
      const run = Effect.runSyncWith(context)
      const status = yield* SubscriptionRef.make<Status>({ leader: false, failing: null })
      const setStatus = (next: Partial<Status>) => run(SubscriptionRef.update(status, (now) => ({ ...now, ...next })))

      // Admission is the storage write of the write's own key; whoever waits on a write learns of it here.
      const admissions = new Map<string, Deferred.Deferred<void, NotAdmitted>>()
      const storage: StorageAdapter = {
        get: options.storage.get.bind(options.storage),
        keys: options.storage.keys.bind(options.storage),
        delete: options.storage.delete.bind(options.storage),
        clear: options.storage.clear.bind(options.storage),
        set: async (key, value) => {
          const admission = admissions.get(key.slice(KEY_PREFIX.length))
          try {
            await options.storage.set(key, value)
          } catch (error) {
            // A real storage failure stays storage even if leadership was lost during the write.
            if (admission) run(Deferred.fail(admission, new NotAdmitted({ reason: "storage" })))
            throw error
          }
          if (admission) run(Deferred.succeed(admission, undefined))
        }
      }

      // Which send of each write this is, for its span; forgotten once the write settles.
      const sends = new Map<string, number>()
      const send = (name: string, mutation: Mutation<R>): OfflineConfig["mutationFns"][string] => (params) => {
        // Every write is made by `transact`, which stores its metadata.
        const { id, metadata } = params.transaction as unknown as { readonly id: string; readonly metadata: Metadata }
        const attempt = (sends.get(id) ?? 0) + 1
        sends.set(id, attempt)
        const trace = metadata.trace
        const outcome = (value: string): Effect.Effect<void> =>
          Effect.all([
            Effect.annotateCurrentSpan({ outcome: value }),
            Metric.update(Metric.withAttributes(attempts, { name, outcome: value }), 1)
          ], { discard: true })
        const program: Effect.Effect<void, Refused | Retry, R> = mutation({
          rows: params.transaction.mutations.map((change) => change.modified),
          idempotencyKey: params.idempotencyKey
        }).pipe(
          Effect.tap(() =>
            Effect.gen(function*() {
              yield* outcome("sent")
              yield* Metric.update(
                Metric.withAttributes(queuedMs, { name }),
                (yield* Clock.currentTimeMillis) - metadata.queuedAt
              )
            })
          ),
          Effect.tapError((error): Effect.Effect<void> =>
            error._tag === "Refused"
              ? Effect.andThen(
                outcome("refused"),
                Metric.update(Metric.withAttributes(refused, { name, status: String(error.status ?? "none") }), 1)
              )
              : outcome("retry")
          ),
          Effect.tapDefect(() =>
            Effect.all([
              outcome("defect"),
              Effect.logError("outbox write failed").pipe(Effect.annotateLogs({ name, outcome: "defect" }))
            ])
          ),
          Effect.withSpan("outbox.send", {
            attributes: { name, attempt },
            ...(trace ? { links: [{ span: Tracer.externalSpan(trace), attributes: {} }] } : {})
          })
        )
        return Effect.runPromiseExitWith(context)(program).then((exit) => {
          if (Exit.isSuccess(exit)) {
            sends.delete(id)
            setStatus({ failing: null })
            return
          }
          const error = Cause.findErrorOption(exit.cause)
          if (Option.isSome(error) && error.value._tag === "Retry") {
            setStatus({ failing: error.value.status === undefined ? "network" : "server" })
            throw thrown(RETRY, "The write didn't get through; it is sent again.")
          }
          sends.delete(id)
          setStatus({ failing: null })
          throw Option.isSome(error)
            ? thrown("OutboxRefused", "The server refused the write.")
            : thrown("OutboxDefect", "The write failed with a defect.")
        })
      }

      const executor = yield* Effect.acquireRelease(
        Effect.sync(() =>
          options.start({
            collections: Object.fromEntries(
              Object.entries(options.collections).map(([key, collection]) => [key, collection.tanstack])
            ),
            storage,
            ...(options.leader ? { leaderElection: options.leader } : {}),
            onlineDetector: options.online,
            mutationFns: Object.fromEntries(
              Object.entries(options.mutations).map(([name, mutation]) => [name, send(name, mutation)])
            ),
            // Only a mutation's `Retry` is sent again: the library's own rules (an `AbortError`, a message with "400")
            // never see another error.
            shouldRetry: (error) => error.name === RETRY,
            onLeadershipChange: (leader) => {
              setStatus({ leader })
              run(Metric.update(Metric.withAttributes(leaderChanges, { leader: String(leader) }), 1))
            }
          })
        ),
        (executor) => Effect.sync(() => executor.dispose())
      )
      yield* Effect.tryPromise(() => executor.waitForInit()).pipe(
        Effect.catch(() => Effect.logWarning("outbox couldn't load its writes"))
      )

      const transact: Service["transact"] = (name, { idempotencyKey }, mutate) =>
        Effect.gen(function*() {
          // A follower would get the library's online-only transaction, with no storage and no retry: refuse instead.
          if (!executor.isOfflineEnabled) return yield* new NotAdmitted({ reason: "follower" })
          const services = yield* Effect.context<never>()
          const span = yield* Effect.option(Effect.currentSpan)
          const metadata: Metadata = {
            queuedAt: yield* Clock.currentTimeMillis,
            ...(Option.isSome(span) ? { trace: { traceId: span.value.traceId, spanId: span.value.spanId } } : {})
          }
          const offline = executor.createOfflineTransaction({
            mutationFnName: name,
            idempotencyKey,
            autoCommit: false,
            metadata: { ...metadata }
          })
          // The library calls `mutate` synchronously, inside the transaction, so its writes join it.
          const changed: { exit: Exit.Exit<void, MutationRefused> } = { exit: Exit.void }
          const transaction = offline.mutate(() => {
            changed.exit = Effect.runSyncExitWith(services)(mutate)
          })
          if (Exit.isFailure(changed.exit)) {
            offline.rollback()
            return yield* Effect.failCause(changed.exit.cause)
          }
          const admission = yield* Deferred.make<void, NotAdmitted>()
          admissions.set(transaction.id, admission)
          // Admitted, the write settles through the executor; refused by the storage, it rolls back before that.
          void offline.commit().catch(() => undefined)
          void transaction.isPersisted.promise.then(
            () => run(Deferred.succeed(admission, undefined)),
            () =>
              run(Deferred.fail(
                admission,
                new NotAdmitted({
                  reason: executor.isOfflineEnabled ? "storage" : "follower"
                })
              ))
          ).finally(() => admissions.delete(transaction.id))
          return {
            id: transaction.id,
            admitted: Deferred.await(admission),
            settled: Effect.tryPromise({
              try: () => transaction.isPersisted.promise,
              catch: (cause) => new TransactionFailed({ cause })
            }).pipe(Effect.asVoid)
          } satisfies Write
        })

      return Outbox.of({
        transact,
        status: SubscriptionRef.changes(status),
        retryNow: Effect.sync(() => executor.getOnlineDetector().notifyOnline())
      })
    })
  )

/**
 * Network detectors for the outbox.
 *
 * @category constructors
 * @since 0.2.0
 */
export const Online = {
  /**
   * Always online: the outbox sends whenever it has a write, and `retryNow`
   * sends at once. For Node, a Worker or a test, where the browser's detector
   * has no `online` event to follow.
   */
  always: (): Online => {
    const listeners = new Set<() => void>()
    return {
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      notifyOnline: () => {
        for (const listener of listeners) listener()
      },
      isOnline: () => true,
      dispose: () => listeners.clear()
    }
  }
}

/**
 * A lock service: `hold(name)` waits until this program holds the exclusive
 * lock `name`, and holds it until the scope closes. `@smthrs/platform-browser`'s
 * `WebLock` is one.
 *
 * @category models
 * @since 0.2.0
 */
export interface Lock {
  readonly hold: (name: string) => Effect.Effect<void, never, Scope.Scope>
}

/**
 * A leader for the outbox over a lock service, so the outbox shares the
 * host's one election mechanism. Unlike the library's `WebLocksLeader`, a
 * program that doesn't get the lock waits for it, so when the leader closes,
 * the next one leads and restores the writes it stored. `requestLeadership`
 * answers within `grantWithin` (default 100 ms); a lock granted later is
 * reported through `onLeadershipChange`. The lock is released when the
 * outbox stops or the scope closes.
 *
 * @category constructors
 * @since 0.2.0
 */
export const lockLeader = (options: {
  readonly lock: Lock
  readonly name: string
  readonly grantWithin?: Duration.Input
}): Effect.Effect<Leader & { readonly dispose: () => void }, never, Scope.Scope> =>
  Effect.gen(function*() {
    const context = yield* Effect.context<never>()
    const fork = Effect.runForkWith(context)
    const listeners = new Set<(leader: boolean) => void>()
    let leader = false
    let holding: Fiber.Fiber<never> | undefined
    const set = (next: boolean) => {
      leader = next
      for (const listener of listeners) listener(next)
    }
    const release = () => {
      if (holding) fork(Fiber.interrupt(holding))
      holding = undefined
    }
    yield* Effect.addFinalizer(() => Effect.sync(release))
    return {
      requestLeadership: () =>
        new Promise<boolean>((granted) => {
          holding = fork(
            Effect.scoped(
              options.lock.hold(options.name).pipe(
                Effect.andThen(Effect.sync(() => {
                  set(true)
                  granted(true)
                })),
                Effect.andThen(Effect.never)
              )
            ).pipe(Effect.onInterrupt(() => Effect.sync(() => leader && set(false))))
          )
          fork(
            Effect.sleep(Duration.fromInputUnsafe(options.grantWithin ?? "100 millis")).pipe(
              Effect.andThen(Effect.sync(() => granted(false)))
            )
          )
        }),
      releaseLeadership: release,
      isLeader: () => leader,
      onLeadershipChange: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      dispose: () => {
        release()
        listeners.clear()
      }
    }
  })
