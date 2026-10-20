import { FetchError } from "@electric-sql/client"
import { LiveQuery, type Persistence } from "@smthrs/effect-tanstack-db"
import { Context, Effect, Exit, Fiber, Option, Schedule, Schema, Scope, Stream, Tracer } from "effect"
import { SqlClient } from "effect/sql"
import { describe, expect, test } from "vitest"
import { ElectricCollection, ShapeSource } from "../src/index.ts"
import {
  databaseFile,
  ELECTRIC_URL,
  electricUp,
  eventually,
  faulty,
  persistenceOn,
  postgres,
  type Row,
  scratchTable,
  storedRows
} from "./fixtures.ts"

// The Electric collection against the real Postgres and Electric (test/fixtures.ts). Faults are injected only on
// Electric's network.

const Note = Schema.Struct({ id: Schema.String, text: Schema.String, n: Schema.Number })

const run = <A, E>(program: Effect.Effect<A, E, Scope.Scope | SqlClient.SqlClient>) =>
  Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(postgres)))

type Options = Partial<Omit<ElectricCollection.Options<Row, unknown, never>, "persist">>

const notesOf = (table: string, options: Options = {}) =>
  ElectricCollection.make<Row, unknown>({
    id: `notes-${crypto.randomUUID()}`,
    schema: Note,
    getKey: (row) => row.id,
    shape: { url: `${ELECTRIC_URL}/v1/shape`, params: { table }, parser: { int8: (value: string) => Number(value) } },
    retry: Schedule.spaced("10 millis"),
    ...options
  })

const changeTo = (id: string) => (change: ElectricCollection.Delivered<Row>) => change.value.id === id
const ids = (rows: ReadonlyArray<Row>) => rows.map(({ id }) => id)

/** Collects every sync event from when it runs, until the scope closes. */
const record = (collection: ElectricCollection.ElectricCollection<Row>) =>
  Effect.gen(function*() {
    const events: Array<string> = []
    yield* collection.sync.pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          events.push(
            event._tag === "Failed"
              ? `Failed:${event.status ?? "network"}`
              : event._tag === "Stopped"
              ? `Stopped:${event.error.status ?? "none"}`
              : event._tag
          )
        })
      ),
      Effect.forkScoped({ startImmediately: true })
    )
    return events
  })

describe.skipIf(!electricUp)("make", () => {
  test("loads the shape, decoded by the schema with int8 parsed, and follows later writes", async () => {
    const rows = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      yield* write({ id: "a", text: "one", n: 9_007_199_254 })
      const notes = yield* notesOf(table)
      yield* notes.preload
      const loaded = yield* notes.toArray
      yield* write({ id: "b", text: "two", n: 2 })
      yield* notes.awaitMatch(changeTo("b"), "5 seconds")
      return { loaded: loaded.map(({ id, n }) => ({ id, n })), later: ids(yield* notes.toArray) }
    }))
    expect(rows).toEqual({ loaded: [{ id: "a", n: 9_007_199_254 }], later: ["a", "b"] })
  })

  test("maps snake_case columns to camelCase fields with snakeCamelMapper", async () => {
    const Camel = Schema.Struct({ id: Schema.String, createdBy: Schema.String })
    const row = await run(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const schema = `effect_electric_${crypto.randomUUID().replaceAll("-", "")}`
      yield* Effect.acquireRelease(
        sql.unsafe(`create schema ${schema}`).pipe(
          Effect.andThen(sql.unsafe(`create table ${schema}.items (id text primary key, created_by text not null)`)),
          Effect.andThen(sql.unsafe(`insert into ${schema}.items values ('a', 'someone')`))
        ),
        () => sql.unsafe(`drop schema ${schema} cascade`).pipe(Effect.ignore)
      )
      const items = yield* ElectricCollection.make({
        id: `items-${crypto.randomUUID()}`,
        schema: Camel,
        getKey: (row) => row.id,
        shape: {
          url: `${ELECTRIC_URL}/v1/shape`,
          params: { table: `${schema}.items` },
          columnMapper: ElectricCollection.snakeCamelMapper()
        }
      })
      yield* items.preload
      return yield* items.get("a")
    }))
    expect(Option.map(row, ({ createdBy }) => createdBy)).toEqual(Option.some("someone"))
  })

  test("a synced row the schema refuses stops the shape, with no status", async () => {
    const Strict = Schema.Struct({ id: Schema.String, text: Schema.Literals(["one", "two"]), n: Schema.Number })
    const stop = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      yield* write({ id: "a", text: "three", n: 1 })
      const notes = yield* ElectricCollection.make({
        id: `strict-${crypto.randomUUID()}`,
        schema: Strict,
        getKey: (row) => row.id,
        shape: { url: `${ELECTRIC_URL}/v1/shape`, params: { table }, parser: { int8: Number } }
      })
      const stopped = yield* notes.sync.pipe(
        Stream.filter((event) => event._tag === "Stopped"),
        Stream.runHead,
        Effect.forkScoped({ startImmediately: true })
      )
      yield* notes.preload.pipe(Effect.ignore, Effect.forkScoped)
      return yield* Fiber.join(stopped)
    }))
    expect(stop).toMatchObject(Option.some({ _tag: "Stopped", error: { _tag: "SyncFailed" } }))
    expect(Option.getOrThrow(stop)._tag === "Stopped" && Option.getOrThrow(stop).error.status).toBe(undefined)
  })

  test("closes the shape when its scope closes", async () => {
    const status = await run(Effect.gen(function*() {
      const { table } = yield* scratchTable
      const scope = yield* Scope.make()
      const notes = yield* Scope.provide(notesOf(table), scope)
      yield* notes.preload
      yield* Scope.close(scope, Exit.void)
      return notes.tanstack.status
    }))
    expect(status).toBe("cleaned-up")
  })
})

// A service an onInsert handler reads from the services of the fiber that made the collection.
class Server extends Context.Service<Server, { readonly persist: (row: Row) => Effect.Effect<number> }>()(
  "test/Server"
) {}

describe.skipIf(!electricUp)("mutation handlers", () => {
  test("onInsert runs with the maker's services and tracer: the row shows at once, then synced once awaited", async () => {
    const spans: Array<string> = []
    const tracer = Tracer.make({
      span(options) {
        spans.push(options.name)
        return new Tracer.NativeSpan(options)
      }
    })
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      const notes = yield* notesOf(table, {
        onInsert: ({ rows, collection }) =>
          Effect.gen(function*() {
            const server = yield* Server
            const txid = yield* server.persist(rows[0]!)
            yield* collection.awaitTxId(txid, "5 seconds")
          }).pipe(Effect.withSpan("persist note")) as never
      }).pipe(
        Effect.provideService(Server, Server.of({ persist: write })),
        Effect.provideService(Tracer.Tracer, tracer)
      )
      yield* notes.preload
      const transaction = yield* notes.insert({ id: "a", text: "one", n: 1 })
      const before = notes.tanstack.get("a")?.$synced
      yield* transaction.persisted
      return { before, after: notes.tanstack.get("a")?.$synced }
    }))
    expect(result).toEqual({ before: false, after: true })
    expect(spans).toContain("persist note")
  })

  test("a handler that fails rolls the rows back, and persisted fails with its error", async () => {
    const result = await run(Effect.gen(function*() {
      const { table } = yield* scratchTable
      const notes = yield* notesOf(table, { onInsert: () => Effect.fail("the server said no") })
      yield* notes.preload
      const transaction = yield* notes.insert({ id: "a", text: "one", n: 1 })
      const shown = notes.tanstack.has("a")
      const error = yield* Effect.flip(transaction.persisted)
      return { shown, error, after: notes.tanstack.has("a") }
    }))
    expect(result).toMatchObject({ shown: true, error: { _tag: "TransactionFailed" }, after: false })
  })

  test("onUpdate receives the changed rows and onDelete the deleted ones", async () => {
    const seen = await run(Effect.gen(function*() {
      const { table, write, rename, remove } = yield* scratchTable
      const seen: Array<string> = []
      yield* write({ id: "a", text: "one", n: 1 })
      const notes = yield* notesOf(table, {
        onUpdate: ({ rows, collection }) =>
          Effect.gen(function*() {
            seen.push(`update:${rows.map(({ text }) => text).join()}`)
            yield* rename(rows[0]!.id, rows[0]!.text)
            yield* collection.awaitMatch((change) => change.value.text === rows[0]!.text, "5 seconds")
          }),
        onDelete: ({ rows, collection }) =>
          Effect.gen(function*() {
            seen.push(`delete:${rows.map(({ id }) => id).join()}`)
            yield* remove(rows[0]!.id)
            yield* collection.awaitMatch((change) => change.operation === "delete", "5 seconds")
          })
      })
      yield* notes.preload
      yield* Effect.flatMap(
        notes.update("a", (draft) => {
          draft.text = "uno"
        }),
        (transaction) => transaction.persisted
      )
      yield* Effect.flatMap(notes.delete("a"), (transaction) => transaction.persisted)
      return { seen, rows: yield* notes.toArray }
    }))
    expect(seen).toEqual({ seen: ["update:uno", "delete:a"], rows: [] })
  })
})

describe.skipIf(!electricUp)("awaiting Electric", () => {
  test("awaitTxId waits for a transaction, and times out on one that never comes", async () => {
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      const notes = yield* notesOf(table)
      yield* notes.preload
      const txid = yield* write({ id: "a", text: "one", n: 1 })
      yield* notes.awaitTxId(txid, "5 seconds")
      const shown = notes.tanstack.has("a")
      const never = yield* Effect.flip(notes.awaitTxId(txid + 1_000_000, "100 millis"))
      return { shown, never: never._tag }
    }))
    expect(result).toEqual({ shown: true, never: "AwaitTimeout" })
  })

  test("awaitMatch counts a change already applied, and times out on one that never comes", async () => {
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      const notes = yield* notesOf(table)
      yield* notes.preload
      yield* write({ id: "a", text: "one", n: 1 })
      yield* notes.awaitMatch(changeTo("a"), "5 seconds")
      yield* notes.awaitMatch(changeTo("a"), "10 millis")
      return (yield* Effect.flip(notes.awaitMatch(changeTo("z"), "100 millis")))._tag
    }))
    expect(result).toBe("AwaitTimeout")
  })

  test("a wait the collection's cleanup ends fails with SyncFailed", async () => {
    const error = await run(Effect.gen(function*() {
      const { table } = yield* scratchTable
      const scope = yield* Scope.make()
      const notes = yield* Scope.provide(notesOf(table), scope)
      yield* notes.preload
      const waiting = yield* notes.awaitMatch(changeTo("z"), "10 seconds").pipe(
        Effect.flip,
        Effect.forkScoped({ startImmediately: true })
      )
      yield* Scope.close(scope, Exit.void)
      return yield* Fiber.join(waiting)
    }))
    expect(error._tag).toBe("SyncFailed")
  })
})

describe.skipIf(!electricUp)("sync status and the sync policy", () => {
  test("reports each request, retries a network failure or a 5xx under the policy, and reconnect retries now", async () => {
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      const { faults, collection: notes } = yield* faulty(notesOf(table, { retry: Schedule.spaced("30 seconds") }))
      const events = yield* record(notes)
      yield* notes.preload
      yield* faults.down()
      yield* write({ id: "a", text: "one", n: 1 })
      yield* eventually(() => events.includes("Failed:network"))
      yield* faults.refuse(503)
      yield* notes.reconnect
      yield* eventually(() => events.includes("Failed:503"))
      yield* faults.heal
      const healedAt = Date.now()
      yield* notes.reconnect
      yield* notes.awaitMatch(changeTo("a"), "5 seconds")
      return { events, waited: Date.now() - healedAt }
    }))
    expect(result.events.slice(0, 2)).toEqual(["Sent", "Succeeded"])
    expect(result.events).not.toContain("Stopped:none")
    expect(result.events.at(-1)).toBe("Succeeded")
    expect(result.waited).toBeLessThan(2_000)
  })

  test("a 4xx stops the shape with its status until reconnect, which restarts it where it stopped", async () => {
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      const { faults, collection: notes } = yield* faulty(notesOf(table))
      const events = yield* record(notes)
      yield* write({ id: "a", text: "one", n: 1 })
      yield* notes.preload
      yield* faults.refuse(400)
      yield* write({ id: "b", text: "two", n: 2 })
      yield* eventually(() => events.includes("Stopped:400"))
      yield* faults.heal
      const before = (yield* faults.sent).length
      // A healthy collection on the same shape sees the next write; the stopped one sends nothing meanwhile.
      const healthy = yield* notesOf(table)
      yield* healthy.preload
      yield* write({ id: "c", text: "three", n: 3 })
      yield* healthy.awaitMatch(changeTo("c"), "5 seconds")
      const quiet = (yield* faults.sent).length === before
      yield* notes.reconnect
      yield* notes.awaitMatch(changeTo("c"), "5 seconds")
      return {
        quiet,
        rows: ids(yield* notes.toArray).sort(),
        resumedFrom: (yield* faults.sent)[before]?.searchParams.get("offset")
      }
    }))
    expect(result.quiet).toBe(true)
    expect(result.rows).toEqual(["a", "b", "c"])
    expect(result.resumedFrom).not.toBe("-1")
  })

  test.each([
    ["a network failure", (faults: ShapeSource.Switches) => faults.down(), "Stopped:none"],
    ["a 503", (faults: ShapeSource.Switches) => faults.refuse(503), "Stopped:503"]
  ])("a policy that ends hands %s to Electric, which stops the shape", async (_, fault, stopped) => {
    const events = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      const { faults, collection: notes } = yield* faulty(notesOf(table, { retry: Schedule.recurs(1) }))
      const events = yield* record(notes)
      yield* notes.preload
      yield* fault(faults)
      yield* write({ id: "a", text: "one", n: 1 })
      yield* eventually(() => events.includes(stopped))
      return events
    }))
    expect(events.filter((event) => event.startsWith("Failed")).length).toBeGreaterThanOrEqual(2)
  })

  test("a shape stopped when its scope closes releases its wait", async () => {
    await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      const scope = yield* Scope.make()
      const { faults, collection: notes } = yield* Scope.provide(faulty(notesOf(table)), scope)
      const events = yield* record(notes)
      yield* notes.preload
      yield* faults.refuse(400)
      yield* write({ id: "a", text: "one", n: 1 })
      yield* eventually(() => events.includes("Stopped:400"))
      yield* Scope.close(scope, Exit.void)
    }))
  })
})

describe.skipIf(!electricUp)("progressive", () => {
  test("loads what a query asks for first, then the whole shape, and follows later writes", async () => {
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      for (const n of [1, 2, 3, 4]) yield* write({ id: `r${n}`, text: "x", n })
      const notes = yield* notesOf(table, { syncMode: "progressive" })
      const newest = yield* LiveQuery.make((q) =>
        q.from({ note: notes.tanstack }).orderBy(({ note }) => note.n, "desc").limit(2)
      )
      yield* newest.preload
      const first = ids(yield* newest.toArray)
      yield* notes.preload
      yield* write({ id: "r5", text: "x", n: 5 })
      yield* notes.awaitMatch(changeTo("r5"), "5 seconds")
      return { first, all: ids(yield* notes.toArray).sort() }
    }))
    expect(result).toEqual({ first: ["r4", "r3"], all: ["r1", "r2", "r3", "r4", "r5"] })
  })
})

describe.skipIf(!electricUp)("persisted", () => {
  // Each program is a scope of its own over one SQLite file: closing one and opening the next is a reload.
  const persisted = (table: string, id: string, schemaVersion = 1) =>
    ElectricCollection.make<Row, unknown>({
      id,
      schema: Note,
      getKey: (row) => row.id,
      shape: { url: `${ELECTRIC_URL}/v1/shape`, params: { table }, parser: { int8: (value: string) => Number(value) } },
      retry: Schedule.spaced("10 millis"),
      persist: { schemaVersion }
    })

  // A program on `path`, its shape requests through the faulty source, which `start` switches before it syncs.
  const program = <A, E>(
    path: string,
    effect: Effect.Effect<A, E, Scope.Scope | Persistence.Persistence | ShapeSource.Faults>,
    start?: (switches: ShapeSource.Switches) => Effect.Effect<void>
  ) => Effect.scoped(effect).pipe(Effect.provide(persistenceOn(path)), Effect.provide(ShapeSource.layerFaulty(start)))

  test("restores the rows before Electric answers, and resumes from the stored handle and offset", async () => {
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      yield* write({ id: "a", text: "one", n: 1 })
      const path = databaseFile()
      const id = `notes-${crypto.randomUUID()}`
      // The first program syncs, and closes once the row is stored.
      yield* program(
        path,
        Effect.flatMap(persisted(table, id), (notes) => notes.preload).pipe(
          Effect.andThen(eventually(() => storedRows(path, id) === 1))
        )
      )
      // Written while no program runs.
      yield* write({ id: "b", text: "two", n: 2 })
      return yield* program(
        path,
        Effect.gen(function*() {
          const faults = yield* ShapeSource.Faults
          const notes = yield* persisted(table, id)
          yield* notes.restored
          const offline = { rows: ids(yield* notes.toArray), status: notes.tanstack.status }
          yield* faults.heal
          yield* notes.reconnect
          yield* notes.preload
          yield* eventually(() => notes.tanstack.has("b"))
          const first = (yield* faults.sent).find((url) => url.searchParams.get("live") !== "true")!
          return {
            offline,
            online: ids(yield* notes.toArray).sort(),
            resumed: { handle: first.searchParams.has("handle"), offset: first.searchParams.get("offset") }
          }
        }),
        (switches) => switches.down()
      )
    }))
    expect(result.offline).toEqual({ rows: ["a"], status: "loading" })
    expect(result.online).toEqual(["a", "b"])
    expect(result.resumed.handle).toBe(true)
    expect(result.resumed.offset).not.toBe("-1")
  })

  test("a new schemaVersion syncs the shape again from the start", async () => {
    const result = await run(Effect.gen(function*() {
      const { table, write } = yield* scratchTable
      yield* write({ id: "a", text: "one", n: 1 })
      const path = databaseFile()
      const id = `notes-${crypto.randomUUID()}`
      // The first program syncs, and closes once the row is stored.
      yield* program(
        path,
        Effect.flatMap(persisted(table, id), (notes) => notes.preload).pipe(
          Effect.andThen(eventually(() => storedRows(path, id) === 1))
        )
      )
      return yield* program(
        path,
        Effect.gen(function*() {
          const faults = yield* ShapeSource.Faults
          const notes = yield* persisted(table, id, 2)
          yield* notes.restored
          const restored = ids(yield* notes.toArray)
          yield* notes.preload
          return {
            restored,
            synced: ids(yield* notes.toArray),
            offset: (yield* faults.sent)[0]!.searchParams.get("offset")
          }
        })
      )
    }))
    expect(result).toEqual({ restored: [], synced: ["a"], offset: "-1" })
  })
})

test("statusOf reads a status from an Electric error or a SyncFailed, anywhere in a cause chain", () => {
  const refused = new FetchError(400, "refused", undefined, {}, `${ELECTRIC_URL}/v1/shape`)
  expect(ElectricCollection.statusOf(new Error("outer", { cause: refused }))).toEqual(Option.some(400))
  const failed = new ElectricCollection.SyncFailed({ cause: new Error("x"), status: 409 })
  expect(ElectricCollection.statusOf(failed)).toEqual(Option.some(409))
  expect(ElectricCollection.statusOf(new Error("outer", { cause: failed }))).toEqual(Option.some(409))
  expect(ElectricCollection.statusOf(new ElectricCollection.SyncFailed({ cause: "no status" }))).toEqual(Option.none())
  expect(ElectricCollection.statusOf("a string")).toEqual(Option.none())
  let deep: unknown = failed
  for (let depth = 0; depth < 8; depth++) deep = new Error("wrap", { cause: deep })
  expect(ElectricCollection.statusOf(deep)).toEqual(Option.none())
})
