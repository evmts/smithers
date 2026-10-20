import { Effect, Exit, Fiber, Latch, Layer, Option, Schedule, Scope, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { afterEach, describe, expect, test } from "vitest"
import { ELECTRIC_URL, postgres, scratchSchema } from "../test/postgres"
import * as Collections from "./collections"
import { makeRuntime } from "./runtime"

// The wrappers against real TanStack DB collections: local-only ones in memory, and Electric ones synced from the
// compose Postgres through the compose Electric (`pnpm db:up`).

type Note = { id: string; text: string; n: number }

const runtimes: Array<{ dispose: () => Promise<void> }> = []
const open = <A, E>(layer: Layer.Layer<A, E>) => {
  const runtime = makeRuntime(layer)
  runtimes.push(runtime)
  return runtime
}
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()))
})

// Polls `check` every 20 ms, for up to 10 s.
const eventually = (check: () => boolean) =>
  Effect.suspend(() => (check() ? Effect.void : Effect.fail("not yet"))).pipe(
    Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 500 }),
    Effect.orDie,
  )

// Runs `use` with a scope it can close itself, so a test can look at a collection after its scope closed.
const inScope = <A, E, R>(use: (scope: Scope.Closeable) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    return yield* use(scope)
  })

const notes = (initialData: Array<Note> = []) =>
  Collections.localOnly<Note, string>({ id: `notes-${crypto.randomUUID()}`, getKey: (note) => note.id, initialData })

describe("localOnly", () => {
  test("lives until its scope closes, then is cleaned up", async () => {
    const runtime = open(Layer.empty)
    const status = await runtime.runPromise(
      inScope((scope) =>
        Effect.gen(function* () {
          const collection = yield* Scope.provide(notes([{ id: "a", text: "one", n: 1 }]), scope)
          yield* Collections.preload(collection)
          const before = collection.status
          yield* Scope.close(scope, Exit.void)
          return [before, collection.status]
        }),
      ),
    )
    expect(status).toEqual(["ready", "cleaned-up"])
  })

  test("reads rows with toArray and get", async () => {
    const runtime = open(Layer.empty)
    const [all, found, missing] = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const collection = yield* notes([
            { id: "a", text: "one", n: 1 },
            { id: "b", text: "two", n: 2 },
          ])
          return [
            yield* Collections.toArray(collection),
            yield* Collections.get(collection, "b"),
            yield* Collections.get(collection, "z"),
          ] as const
        }),
      ),
    )
    expect(all.map(({ id, text, n }) => ({ id, text, n }))).toEqual([
      { id: "a", text: "one", n: 1 },
      { id: "b", text: "two", n: 2 },
    ])
    expect(Option.map(found, ({ text }) => text)).toEqual(Option.some("two"))
    expect(missing).toEqual(Option.none())
  })

  test("inserts, updates and removes at once, and every transaction settles", async () => {
    const runtime = open(Layer.empty)
    const states = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const collection = yield* notes()
          const texts = () => collection.toArray.map(({ id, text }) => `${id}:${text}`)
          const seen: Array<Array<string>> = []
          const inserted = yield* Collections.insert(collection, [
            { id: "a", text: "one", n: 1 },
            { id: "b", text: "two", n: 2 },
          ])
          seen.push(texts())
          const updated = yield* Collections.update(collection, "a", (note) => {
            note.text = "uno"
          })
          seen.push(texts())
          const removed = yield* Collections.remove(collection, "b")
          seen.push(texts())
          yield* Effect.all([inserted, updated, removed].map(Collections.settled))
          return seen
        }),
      ),
    )
    expect(states).toEqual([["a:one", "b:two"], ["a:uno", "b:two"], ["a:uno"]])
  })

  test("refuses a duplicate key, and an update to a key that isn't there", async () => {
    const runtime = open(Layer.empty)
    const [duplicate, missing] = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const collection = yield* notes([{ id: "a", text: "one", n: 1 }])
          return [
            yield* Effect.flip(Collections.insert(collection, { id: "a", text: "again", n: 2 })),
            yield* Effect.flip(Collections.update(collection, "z", () => {})),
          ] as const
        }),
      ),
    )
    expect(duplicate).toMatchObject({ _tag: "MutationRefused", operation: "insert" })
    expect(missing).toMatchObject({ _tag: "MutationRefused", operation: "update" })
  })
})

describe("changes", () => {
  test("streams each change in order, after the current rows when asked, and unsubscribes when its scope closes", async () => {
    const runtime = open(Layer.empty)
    const { batches, subscribers } = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const collection = yield* notes([{ id: "a", text: "one", n: 1 }])
          const batches = yield* Effect.scoped(
            Effect.gen(function* () {
              const changes = yield* Collections.changes(collection, { includeInitialState: true })
              const fiber = yield* changes.pipe(Stream.take(4), Stream.runCollect, Effect.forkChild)
              yield* Collections.insert(collection, { id: "b", text: "two", n: 2 })
              yield* Collections.update(collection, "a", (note) => {
                note.n = 10
              })
              yield* Collections.remove(collection, "b")
              return yield* Fiber.join(fiber)
            }),
          )
          return { batches, subscribers: collection.subscriberCount }
        }),
      ),
    )
    expect(batches.map((batch) => batch.map(({ type, key }) => `${type}:${key}`))).toEqual([
      ["insert:a"],
      ["insert:b"],
      ["update:a"],
      ["delete:b"],
    ])
    expect(batches[2]?.[0]?.value).toMatchObject({ id: "a", n: 10 })
    expect(subscribers).toBe(0)
  })

  test("without the current rows, starts at the next change", async () => {
    const runtime = open(Layer.empty)
    const batch = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const collection = yield* notes([{ id: "a", text: "one", n: 1 }])
          const changes = yield* Collections.changes(collection)
          const fiber = yield* Stream.runHead(changes).pipe(Effect.forkChild)
          yield* Collections.insert(collection, { id: "b", text: "two", n: 2 })
          return yield* Fiber.join(fiber)
        }),
      ),
    )
    expect(Option.map(batch, (changes) => changes.map(({ key }) => key))).toEqual(Option.some(["b"]))
  })
})

describe("liveQuery", () => {
  test("keeps a typed, ordered view of its source, and is cleaned up with its scope", async () => {
    const runtime = open(Layer.empty)
    const result = await runtime.runPromise(
      inScope((scope) =>
        Effect.gen(function* () {
          const collection = yield* Scope.provide(
            notes([
              { id: "a", text: "one", n: 2 },
              { id: "b", text: "two", n: 1 },
            ]),
            scope,
          )
          const ordered = yield* Scope.provide(
            Collections.liveQuery((q) =>
              q
                .from({ note: collection })
                .orderBy(({ note }) => note.n)
                .select(({ note }) => ({ id: note.id, n: note.n })),
            ),
            scope,
          )
          const first = yield* Scope.provide(
            Collections.liveQuery((q) =>
              q
                .from({ note: collection })
                .where(({ note }) => Collections.eq(note.id, "a"))
                .findOne(),
            ),
            scope,
          )
          yield* Collections.preload(ordered)
          yield* Collections.preload(first)
          const before = ordered.toArray.map(({ id }) => id)
          yield* Collections.insert(collection, { id: "c", text: "three", n: 0 })
          const after = ordered.toArray.map(({ id }) => id)
          const one = first.toArray[0]?.text
          yield* Scope.close(scope, Exit.void)
          return { before, after, one, status: ordered.status }
        }),
      ),
    )
    expect(result).toEqual({ before: ["b", "a"], after: ["c", "b", "a"], one: "one", status: "cleaned-up" })
  })
})

describe("electric", () => {
  type Row = { id: string; text: string; n: number }

  // A scratch table, dropped when the scope closes, and a way to write to it as a server would.
  const scratchTable = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const schema = scratchSchema("test_collections")
    yield* Effect.acquireRelease(
      sql.unsafe(`create schema ${schema}`).pipe(
        Effect.andThen(sql.unsafe(`create table ${schema}.notes (id text primary key, text text not null, n bigint not null)`)),
      ),
      () => sql.unsafe(`drop schema ${schema} cascade`).pipe(Effect.ignore),
    )
    const table = `${schema}.notes`
    const write = (row: Row) => sql`insert into ${sql(table)} ${sql.insert(row)}`.pipe(Effect.asVoid, Effect.orDie)
    const rename = (id: string, text: string) =>
      sql`update ${sql(table)} set text = ${text} where id = ${id}`.pipe(Effect.asVoid, Effect.orDie)
    return { table, write, rename }
  })

  // Electric's network: a switch that makes it unreachable, one that makes it refuse (400), a gate that holds live
  // requests back, as a slow link would, and the requests it carried.
  const network = () => {
    let fault: "down" | "refusing" | undefined
    let held: { readonly promise: Promise<void>; readonly release: () => void } | undefined
    const requests: Array<URL> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      requests.push(url)
      if (url.searchParams.get("live") === "true" && held !== undefined) await held.promise
      if (fault === "down") throw new TypeError("fetch failed")
      if (fault === "refusing") return Response.json({ message: "refused" }, { status: 400 })
      return globalThis.fetch(input, init)
    }
    return {
      fetch,
      requests,
      cut: () => {
        fault = "down"
      },
      refuse: () => {
        fault = "refusing"
      },
      heal: () => {
        fault = undefined
      },
      holdLive: () => {
        let release = () => {}
        const promise = new Promise<void>((resolve) => {
          release = resolve
        })
        held = { promise, release }
      },
      releaseLive: () => {
        held?.release()
        held = undefined
      },
    }
  }

  const notesOf = (
    table: string,
    options: {
      readonly onInsert?: (params: Collections.InsertParams<Row>) => Effect.Effect<void, unknown>
      readonly onSyncError?: (error: Collections.SyncFailed) => Effect.Effect<Collections.SyncDecision>
      readonly onRequest?: (event: Collections.RequestEvent) => Effect.Effect<void>
      readonly syncMode?: Collections.SyncMode
      readonly backoff?: Collections.Backoff
      readonly fetch?: typeof globalThis.fetch
    } = {},
  ) =>
    Collections.electric<Row, unknown>({
      id: `notes-${crypto.randomUUID()}`,
      getKey: (row) => row.id,
      shape: {
        url: `${ELECTRIC_URL}/v1/shape`,
        params: { table },
        parser: { int8: (value: string) => Number(value) },
        ...(options.fetch === undefined ? {} : { fetchClient: options.fetch }),
      },
      backoff: options.backoff ?? { initial: "10 millis", max: "10 millis" },
      ...(options.syncMode === undefined ? {} : { syncMode: options.syncMode }),
      ...(options.onRequest === undefined ? {} : { onRequest: options.onRequest }),
      onInsert: options.onInsert ?? (() => Effect.void),
      onSyncError: options.onSyncError ?? (() => Effect.succeed("stop" as const)),
    })

  const changeTo = (id: string) => (message: Collections.ShapeMessage<Row>) =>
    Collections.isChangeMessage(message) && message.value.id === id
  // Waits until Electric has delivered a change to row `id`.
  const delivered = (collection: Parameters<typeof Collections.awaitMatch<Row>>[0], id: string) =>
    Collections.awaitMatch(collection, changeTo(id), "5 seconds")
  const ids = (rows: ReadonlyArray<Row>) => rows.map(({ id }) => id)

  test("loads the shape, with int8 parsed to a number, and follows later writes", async () => {
    const runtime = open(postgres)
    const rows = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write } = yield* scratchTable
          yield* write({ id: "a", text: "one", n: 9_007_199_254 })
          const { collection } = yield* notesOf(table)
          yield* Collections.preload(collection)
          const loaded = collection.toArray.map(({ id, n }) => ({ id, n }))
          yield* write({ id: "b", text: "two", n: 2 })
          yield* delivered(collection, "b")
          return { loaded, later: ids(collection.toArray) }
        }),
      ),
    )
    expect(rows).toEqual({ loaded: [{ id: "a", n: 9_007_199_254 }], later: ["a", "b"] })
  })

  test("awaitMatch waits for a change Electric delivers, counts one already delivered, and times out", async () => {
    const runtime = open(postgres)
    const result = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write } = yield* scratchTable
          const { collection } = yield* notesOf(table)
          yield* Collections.preload(collection)
          const waiting = yield* delivered(collection, "a").pipe(Effect.forkChild)
          yield* write({ id: "a", text: "one", n: 1 })
          yield* Fiber.join(waiting)
          const shown = collection.has("a")
          yield* Collections.awaitMatch(collection, changeTo("a"), "10 millis")
          const never = yield* Effect.flip(Collections.awaitMatch(collection, changeTo("z"), "200 millis"))
          return { shown, never: never._tag }
        }),
      ),
    )
    expect(result).toEqual({ shown: true, never: "MatchTimeout" })
  })

  test("runs onInsert on the runtime: the row shows at once, then as synced once onInsert sees it delivered", async () => {
    const runtime = open(postgres)
    const result = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write } = yield* scratchTable
          const { collection } = yield* notesOf(table, {
            onInsert: ({ transaction, collection }) => {
              const row = transaction.mutations[0].modified
              return write(row).pipe(Effect.andThen(delivered(collection, row.id)))
            },
          })
          yield* Collections.preload(collection)
          const transaction = yield* Collections.insert(collection, { id: "a", text: "one", n: 1 })
          const before = collection.get("a")?.$synced
          yield* Collections.settled(transaction)
          return { before, after: collection.get("a")?.$synced, rows: collection.toArray.map(({ id, n }) => ({ id, n })) }
        }),
      ),
    )
    expect(result).toEqual({ before: false, after: true, rows: [{ id: "a", n: 1 }] })
  })

  test("rolls the row back when onInsert fails, and settled fails with TransactionFailed", async () => {
    const runtime = open(postgres)
    const result = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table } = yield* scratchTable
          const { collection } = yield* notesOf(table, { onInsert: () => Effect.fail("ChatApi said no") })
          yield* Collections.preload(collection)
          const transaction = yield* Collections.insert(collection, { id: "a", text: "one", n: 1 })
          const shown = collection.has("a")
          const error = yield* Effect.flip(Collections.settled(transaction))
          return { shown, error: error._tag, after: collection.has("a") }
        }),
      ),
    )
    expect(result).toEqual({ shown: true, error: "TransactionFailed", after: false })
  })

  test("reports a shape Electric refuses through onSyncError, with its status; stop fails the first snapshot", async () => {
    const runtime = open(postgres)
    const errors: Array<Collections.SyncFailed> = []
    const failed = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { collection } = yield* notesOf("no_such_schema.notes", {
            onSyncError: (error) => Effect.sync(() => errors.push(error)).pipe(Effect.as("stop" as const)),
          })
          return yield* Effect.flip(Collections.preload(collection).pipe(Effect.timeout("10 seconds")))
        }),
      ),
    )
    expect(failed).toMatchObject({ _tag: "SyncFailed" })
    expect(errors.map(({ status }) => status)).toEqual([400])
  })

  test("retry restarts a shape Electric gave up on where it stopped, keeping its rows", async () => {
    const runtime = open(postgres)
    const net = network()
    const errors: Array<Collections.SyncFailed> = []
    const result = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write } = yield* scratchTable
          const retry = yield* Latch.make(false)
          const { collection } = yield* notesOf(table, {
            fetch: net.fetch,
            onSyncError: (error) =>
              Effect.sync(() => errors.push(error)).pipe(Effect.andThen(retry.await), Effect.as("retry" as const)),
          })
          yield* write({ id: "a", text: "one", n: 1 })
          yield* Collections.preload(collection)
          net.refuse()
          // The live request in flight returns with this write; the next one is refused.
          yield* write({ id: "b", text: "two", n: 2 })
          yield* eventually(() => errors.length === 1)
          yield* write({ id: "c", text: "three", n: 3 })
          const before = net.requests.length
          net.heal()
          yield* retry.open
          yield* delivered(collection, "c")
          return {
            rows: ids(collection.toArray).sort(),
            status: yield* Collections.status(collection),
            resumedFrom: net.requests[before]?.searchParams.get("offset"),
          }
        }),
      ),
    )
    expect(errors.map(({ status }) => status)).toEqual([400])
    expect(result.rows).toEqual(["a", "b", "c"])
    expect(result.status).toBe("ready")
    // Not from the start: the restart keeps its place in the shape.
    expect(result.resumedFrom).not.toBe("-1")
  })

  test("retries a request that fails on the network after the backoff, forever, reporting each one; reconnect retries now", async () => {
    const runtime = open(postgres)
    const net = network()
    const events: Array<string> = []
    const errors: Array<Collections.SyncFailed> = []
    const result = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write } = yield* scratchTable
          const { collection, reconnect } = yield* notesOf(table, {
            fetch: net.fetch,
            backoff: { initial: "50 millis", max: "30 seconds" },
            onRequest: (event) => Effect.sync(() => events.push(event._tag)),
            onSyncError: (error) => Effect.sync(() => errors.push(error)).pipe(Effect.as("stop" as const)),
          })
          yield* Collections.preload(collection)
          net.cut()
          yield* write({ id: "a", text: "one", n: 1 })
          // Each retry waits twice as long as the last, so after a few the next is seconds away.
          yield* eventually(() => events.filter((event) => event === "failed").length >= 6)
          yield* write({ id: "b", text: "two", n: 2 })
          net.heal()
          const healedAt = Date.now()
          yield* reconnect
          yield* delivered(collection, "b")
          return { waited: Date.now() - healedAt, rows: ids(collection.toArray).sort() }
        }),
      ),
    )
    expect(errors).toEqual([])
    expect(events.slice(0, 2)).toEqual(["sent", "succeeded"])
    expect(events).toContain("failed")
    expect(events.at(-1)).toBe("succeeded")
    expect(result.rows).toEqual(["a", "b"])
    expect(result.waited).toBeLessThan(1_000)
  })

  test("on demand, loads only the window a query asks for; setWindow widens it, and later writes still arrive", async () => {
    const runtime = open(postgres)
    const result = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write } = yield* scratchTable
          for (const n of [1, 2, 3, 4, 5]) yield* write({ id: `r${n}`, text: "x", n })
          const { collection } = yield* notesOf(table, { syncMode: "on-demand" })
          const newest = yield* Collections.liveQuery((q) =>
            q
              .from({ note: collection })
              .orderBy(({ note }) => note.n, "desc")
              .limit(2),
          )
          yield* Collections.preload(newest)
          const first = { shown: ids(newest.toArray), loaded: ids(collection.toArray).sort() }
          const before = yield* Collections.getWindow(newest)
          yield* Collections.setWindow(newest, { limit: 4 })
          const second = { shown: ids(newest.toArray), loaded: ids(collection.toArray).sort() }
          const after = yield* Collections.getWindow(newest)
          yield* write({ id: "r6", text: "x", n: 6 })
          yield* delivered(collection, "r6")
          return { first, second, before, after, third: ids(newest.toArray) }
        }),
      ),
    )
    expect(result.first).toEqual({ shown: ["r5", "r4"], loaded: ["r4", "r5"] })
    expect(result.before).toEqual(Option.some({ offset: 0, limit: 2 }))
    expect(result.second).toEqual({ shown: ["r5", "r4", "r3", "r2"], loaded: ["r2", "r3", "r4", "r5"] })
    expect(result.after).toEqual(Option.some({ offset: 0, limit: 4 }))
    expect(result.third).toEqual(["r6", "r5", "r4", "r3"])
  })

  test("on demand, a later subset load doesn't skip a change Electric hasn't delivered yet", async () => {
    // @electric-sql/client 1.5.28 moves the shape's offset to every subset snapshot's, which drops changes to rows
    // outside that snapshot that the live stream hasn't delivered yet. `electric` keeps the offset after the first.
    const runtime = open(postgres)
    const net = network()
    const text = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write, rename } = yield* scratchTable
          for (const n of [1, 2]) yield* write({ id: `r${n}`, text: "x", n })
          const { collection } = yield* notesOf(table, { syncMode: "on-demand", fetch: net.fetch })
          const newest = yield* Collections.liveQuery((q) =>
            q
              .from({ note: collection })
              .orderBy(({ note }) => note.n, "desc")
              .limit(1),
          )
          yield* Collections.preload(newest)
          yield* write({ id: "r3", text: "new", n: 3 })
          yield* delivered(collection, "r3")
          // r3 changes while the live stream is slow, then a query loads only r1.
          net.holdLive()
          const changed = yield* Collections.awaitMatch(
            collection,
            (message) => changeTo("r3")(message) && Collections.isChangeMessage(message) && message.value.text === "changed",
            "5 seconds",
          ).pipe(Effect.forkChild)
          yield* rename("r3", "changed")
          const first = yield* Collections.liveQuery((q) =>
            q.from({ note: collection }).where(({ note }) => Collections.eq(note.n, 1)),
          )
          yield* Collections.preload(first)
          net.releaseLive()
          yield* Fiber.join(changed)
          return collection.get("r3")?.text
        }),
      ),
    )
    expect(text).toBe("changed")
  })

  test("setWindow fails with WindowFailed when the rows can't load, and the query keeps its window", async () => {
    const runtime = open(postgres)
    const net = network()
    const result = await runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { table, write } = yield* scratchTable
          for (const n of [1, 2, 3]) yield* write({ id: `r${n}`, text: "x", n })
          const { collection } = yield* notesOf(table, { syncMode: "on-demand", fetch: net.fetch })
          const newest = yield* Collections.liveQuery((q) =>
            q
              .from({ note: collection })
              .orderBy(({ note }) => note.n, "desc")
              .limit(1),
          )
          yield* Collections.preload(newest)
          net.refuse()
          const error = yield* Effect.flip(Collections.setWindow(newest, { limit: 3 }))
          return { error: error._tag, window: yield* Collections.getWindow(newest), shown: ids(newest.toArray) }
        }),
      ),
    )
    expect(result).toEqual({ error: "WindowFailed", window: Option.some({ offset: 0, limit: 1 }), shown: ["r3"] })
  })

  test("closes the shape when its scope closes", async () => {
    const runtime = open(postgres)
    const status = await runtime.runPromise(
      inScope((scope) =>
        Effect.gen(function* () {
          const { table } = yield* Scope.provide(scratchTable, scope)
          const { collection } = yield* Scope.provide(notesOf(table), scope)
          yield* Collections.preload(collection)
          yield* Scope.close(scope, Exit.void)
          return collection.status
        }),
      ),
    )
    expect(status).toBe("cleaned-up")
  })
})
