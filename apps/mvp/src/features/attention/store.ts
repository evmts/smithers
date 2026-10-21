import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection } from "@smthrs/effect-tanstack-db"
import { Clock, Context, Duration, Effect, FiberHandle, Layer, Metric, Queue, type Scope, Stream } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { AuthStore } from "../auth/store"
import { ChatStore } from "../chat/store"
import { NOTIFICATIONS_SHAPE_ROUTE } from "./contract"
import { feedOf, follows, landed } from "./entries"
import { shown } from "./metrics"
import { listQuery, stackQuery } from "./queries"
import { Entry, Notice, Pending } from "./schema"

// The personal feed on this tab (decision 0009, docs/features/notifications.md#the-browser): the person's
// `notifications`, synced by Electric and kept on the device; the acts this device took that haven't synced back yet,
// kept on the device too; and the entries the views read, worked out from both, the clock and the conversation the tab
// shows (`feedOf`). Two followers run while the store lives:
// - the feed: works the entries out again whenever a row, an act or the conversation changes, and when a toast is due
//   to hide; forgets acts the rows show; records each toast once per version;
// - the watch: follows the branch and repository of each conversation the tab shows (`watch/set`, door `view`), once
//   per person per conversation per tab, for a Member (or while sign-in can't say who is signed in).

/** Where the feed syncs from: ChatApi's origin, the site's own. */
export interface AttentionConfig {
  readonly origin: string
}

/** Where Open takes the person: the router's navigate, as the host gives it. */
export class AttentionNavigation extends Context.Service<
  AttentionNavigation,
  { readonly navigate: (path: string) => void }
>()("@smthrs/mvp/attention/AttentionNavigation") {}

type Success<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

/** Whether an entry reads differently from what the tab holds. */
const changed = (old: Entry, next: Entry) =>
  (Object.keys(next) as ReadonlyArray<keyof Entry>).some((field) => old[field] !== next[field])

export class AttentionStore extends Context.Service<
  AttentionStore,
  {
    readonly notices: ElectricCollection.ElectricCollection<Notice>
    readonly pending: Collection.Collection<Pending, string>
    readonly entries: Collection.Collection<Entry, string>
    readonly stack: Success<typeof stackQuery>
    readonly stackHere: Success<typeof stackQuery>
    readonly list: Success<typeof listQuery>
    readonly listHere: Success<typeof listQuery>
    /** Where the background work an action starts runs. */
    readonly scope: Scope.Scope
  }
>()("@smthrs/mvp/attention/AttentionStore") {
  /** The store, its followers running until the scope closes. Needs chat's and sign-in's stores, and dispatch. */
  static readonly layer = (config: AttentionConfig) =>
    Layer.effect(
      AttentionStore,
      Effect.gen(function* () {
        const scope = yield* Effect.scope
        const { place } = yield* ChatStore
        const auth = yield* AuthStore
        const flows = yield* FlowDispatch
        const notices = yield* ElectricCollection.make<Notice>({
          id: "notifications",
          schema: Notice,
          getKey: (row) => row.subject,
          syncMode: "eager",
          persist: { schemaVersion: 1 },
          shape: {
            url: `${config.origin}${NOTIFICATIONS_SHAPE_ROUTE}`,
            columnMapper: ElectricCollection.snakeCamelMapper(),
          },
        })
        const pending = yield* Collection.persisted<Pending, string>({
          id: "attention-pending",
          schema: Pending,
          getKey: (row) => row.id,
          schemaVersion: 1,
        })
        const entries = yield* Collection.local<Entry, string>({
          id: "attention-entries",
          schema: Entry,
          getKey: (row) => row.id,
        })

        // The feed: worked out again on every change, and when the next toast is due to hide.
        const ticks = yield* Queue.unbounded<void>()
        const timer = yield* FiberHandle.make<void, never>()
        const recorded = new Set<string>()
        const work = Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const rows = yield* notices.toArray
          const acts = yield* pending.toArray
          // Chat's place always holds its one row.
          const where = (yield* place.toArray)[0]!
          const feed = feedOf(rows, acts, now, where.conversationId)
          const before = new Map((yield* entries.toArray).map((entry) => [entry.id, entry]))
          const next = new Set(feed.entries.map((entry) => entry.id))
          const gone = [...before.keys()].filter((id) => !next.has(id))
          if (gone.length > 0) yield* entries.delete(gone)
          for (const entry of feed.entries) {
            const old = before.get(entry.id)
            if (old === undefined) yield* entries.insert(entry)
            else if (changed(old, entry)) {
              yield* entries.update(entry.id, (draft) => void Object.assign(draft, entry))
            }
            // Each toast that came to show, once per version: a log line and a count, never its words.
            const key = `${entry.id}:${entry.version}`
            if (entry.stack && !recorded.has(key)) {
              recorded.add(key)
              yield* Metric.update(Metric.withAttributes(shown, { state: entry.state }), 1)
              yield* Effect.logInfo("notifications.shown").pipe(
                Effect.annotateLogs({ subject: entry.id, version: entry.version, state: entry.state, kind: entry.kind }),
              )
            }
          }
          const done = landed(rows, acts)
          if (done.length > 0) yield* pending.delete(done)
          if (feed.nextAt === undefined) yield* FiberHandle.clear(timer)
          else {
            yield* FiberHandle.run(
              timer,
              Effect.sleep(Duration.millis(feed.nextAt - now)).pipe(
                Effect.andThen(Queue.offer(ticks, undefined)),
                Effect.asVoid,
              ),
            )
          }
        }).pipe(
          // Local collections refuse only rows their own schema rejects, which `feedOf` never makes: a bug, not a state.
          Effect.orDie,
        )
        yield* Stream.mergeAll(
          [
            Stream.map(notices.changes({ initial: true }), () => undefined),
            Stream.map(pending.changes({ initial: true }), () => undefined),
            Stream.map(place.changes({ initial: true }), () => undefined),
            Stream.fromQueue(ticks),
          ],
          { concurrency: "unbounded" },
        ).pipe(Stream.runForEach(() => work), Effect.forkIn(scope, { startImmediately: true }))

        // The watch: each conversation this tab shows, once per person, once sign-in says a Member is signed in, or
        // can't say (ChatApi decides then). Signed out, still loading, or below a Member, nothing is asked.
        const watched = new Set<string>()
        const watch = Effect.gen(function* () {
          // Sign-in's store and chat's place each always hold their one row.
          const session = (yield* auth.session.toArray)[0]!
          const shown = (yield* place.toArray)[0]!
          const key = `${session.login ?? ""}:${shown.conversationId ?? "home"}`
          yield* Effect.sync(() => watched.add(key)).pipe(
            Effect.andThen(flows.dispatch("watch/set", { conversationId: shown.conversationId }, { door: "view" })),
            Effect.ignore,
            Effect.forkIn(scope),
            Effect.when(Effect.sync(() => follows(session) && !watched.has(key))),
          )
        })
        yield* Stream.merge(auth.session.changes({ initial: true }), place.changes({ initial: true })).pipe(
          Stream.runForEach(() => watch),
          Effect.forkIn(scope, { startImmediately: true }),
        )

        return AttentionStore.of({
          notices,
          pending,
          entries,
          stack: yield* stackQuery(entries, "stack"),
          stackHere: yield* stackQuery(entries, "stackHere"),
          list: yield* listQuery(entries, "stack"),
          listHere: yield* listQuery(entries, "stackHere"),
          scope,
        })
      }),
    )
}
