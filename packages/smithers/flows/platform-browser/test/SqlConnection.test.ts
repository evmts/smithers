/**
 * The leader's connection to the app's shared database: one owner's
 * transaction at a time, decided by SQLite's own autocommit flag.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import { BrowserRuntime, BrowserSqlite } from "../src/index.ts"
import * as SqlConnection from "../src/internal/SqlConnection.ts"
import * as SqlProtocol from "../src/internal/SqlProtocol.ts"
import * as MemorySqlite from "./fixtures/MemorySqlite.ts"
import * as Telemetry from "./fixtures/Telemetry.ts"

/** A connection over a fresh in-memory database with a table `t`. */
const connection = Effect.gen(function*() {
  const service = yield* SqlConnection.make(yield* MemorySqlite.open)
  yield* service.run("setup", "CREATE TABLE t (id INTEGER PRIMARY KEY)", [], false)
  return service
})

const count = (service: SqlConnection.Service, owner: string) =>
  Effect.map(service.run(owner, "SELECT count(*) AS n FROM t", [], false), ({ rows }) => rows)

describe("SqlConnection", () => {
  it.live("fails abandonment and wakes blocked owners when SQLite refuses rollback", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(
      Effect.gen(function*() {
        const database = yield* MemorySqlite.open
        const service = yield* SqlConnection.make(database)
        yield* service.run("a", "BEGIN", [], false)
        // SQLite's real authorizer refuses ROLLBACK and leaves autocommit off.
        database.sqlite3.set_authorizer(
          database.db,
          (_, action, operation) => action === 22 && operation === "ROLLBACK" ? 1 : 0,
          null
        )
        const reader = yield* Effect.forkChild(service.run("b", "SELECT 1", [], false))
        yield* Effect.sleep("20 millis")
        expect(reader.pollUnsafe()).toBeUndefined()
        const abandoned = yield* Effect.exit(service.abandon("a"))
        expect(Exit.isFailure(abandoned)).toBe(true)
        expect(Exit.isFailure(yield* Effect.exit(service.abandon("a")))).toBe(true)
        const waiting = yield* Fiber.await(reader).pipe(Effect.timeoutOption("300 millis"))
        expect(waiting).toMatchObject({ _tag: "Some", value: { _tag: "Failure" } })
        expect(yield* service.run("c", "SELECT 1", [], false).pipe(Effect.flip)).toMatchObject({ _tag: "SqlError" })
        database.sqlite3.set_authorizer(database.db, () => 0, null)
        yield* Effect.promise(() => database.sqlite3.exec(database.db, "ROLLBACK"))
      }).pipe(Effect.scoped)
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(BrowserRuntime.statements, { outcome: "abandon_failed" })).toBe(1)
      expect(telemetry.lines("browser.runtime.statement")).toMatchObject([
        { annotations: { outcome: "abandon_failed", "error.type": "SqlError" } }
      ])
      expect(telemetry.named("browser.runtime.abandon")).toHaveLength(2)
    })))
  })

  it.effect("returns rows, and says whether the statement left a transaction open", () =>
    Effect.gen(function*() {
      const service = yield* connection
      expect(yield* service.run("a", "INSERT INTO t (id) VALUES (?)", [1], false)).toEqual({ rows: [], open: false })
      expect(yield* service.run("a", "BEGIN IMMEDIATE", [], false)).toEqual({ rows: [], open: true })
      expect(yield* service.run("a", "SELECT id FROM t", [], true)).toEqual({ rows: [{ id: 1 }], open: true })
      expect(yield* service.run("a", "COMMIT", [], true)).toEqual({ rows: [], open: false })
    }).pipe(Effect.scoped))

  it.live("makes another owner wait while a transaction is open, and lets it in when the transaction ends", () =>
    Effect.gen(function*() {
      const service = yield* connection
      yield* service.run("a", "BEGIN IMMEDIATE", [], false)
      yield* service.run("a", "INSERT INTO t (id) VALUES (1)", [], true)
      const reader = yield* Effect.forkChild(count(service, "b"))
      yield* Effect.sleep("30 millis")
      // b never reads a's uncommitted row.
      expect(reader.pollUnsafe()).toBeUndefined()
      yield* service.run("a", "COMMIT", [], true)
      expect(yield* Fiber.join(reader)).toEqual([{ n: 1 }])
    }).pipe(Effect.scoped))

  it.live("rolls back an abandoned owner's transaction and lets the waiting owner in", () =>
    Effect.gen(function*() {
      const service = yield* connection
      yield* service.run("a", "BEGIN IMMEDIATE", [], false)
      yield* service.run("a", "INSERT INTO t (id) VALUES (1)", [], true)
      const reader = yield* Effect.forkChild(count(service, "b"))
      // Abandoning an owner with no open transaction changes nothing.
      yield* service.abandon("b")
      yield* Effect.sleep("20 millis")
      expect(reader.pollUnsafe()).toBeUndefined()
      yield* service.abandon("a")
      expect(yield* Fiber.join(reader)).toEqual([{ n: 0 }])
    }).pipe(Effect.scoped))

  it.effect("refuses a statement for a transaction that is gone, whoever holds the connection now", () =>
    Effect.gen(function*() {
      const service = yield* connection
      const nobody = yield* service.run("a", "INSERT INTO t (id) VALUES (1)", [], true).pipe(Effect.flip)
      expect(nobody._tag).toBe("@smthrs/platform-browser/TransactionLost")
      yield* service.run("b", "BEGIN IMMEDIATE", [], false)
      const another = yield* service.run("a", "INSERT INTO t (id) VALUES (1)", [], true).pipe(Effect.flip)
      expect(another._tag).toBe("@smthrs/platform-browser/TransactionLost")
      yield* service.run("b", "ROLLBACK", [], true)
      expect(yield* count(service, "a")).toEqual([{ n: 0 }])
    }).pipe(Effect.scoped))

  it.effect("keeps the owner's transaction open when one of its statements fails, and fails it with a SqlError", () =>
    Effect.gen(function*() {
      const service = yield* connection
      const outside = yield* service.run("a", "SELECT * FROM missing", [], false).pipe(Effect.flip)
      expect(outside._tag).toBe("SqlError")
      yield* service.run("a", "BEGIN IMMEDIATE", [], false)
      yield* service.run("a", "INSERT INTO t (id) VALUES (1)", [], true)
      const duplicate = yield* service.run("a", "INSERT INTO t (id) VALUES (1)", [], true).pipe(Effect.flip)
      expect(duplicate._tag).toBe("SqlError")
      // Still a's: the next statement continues the transaction.
      expect(yield* service.run("a", "COMMIT", [], true)).toEqual({ rows: [], open: false })
      expect(yield* count(service, "b")).toEqual([{ n: 1 }])
    }).pipe(Effect.scoped))

  it.effect("opens over a file on the build's VFS, on a connection of its own", () =>
    Effect.gen(function*() {
      const pool = yield* MemorySqlite.pool
      const opened = SqlConnection.layer({ filename: "app.db" }).pipe(
        Layer.provide(Layer.succeed(BrowserSqlite.Sqlite)(pool))
      )
      const rows = yield* Effect.flatMap(SqlConnection.SqlConnection, (service) =>
        service.run("a", "SELECT 7 AS seven", [], false)).pipe(Effect.provide(opened))
      expect(rows).toEqual({ rows: [{ seven: 7 }], open: false })
    }))
})

/** A connection with a table `t` and the receipts table, as the leader prepares it. */
const receipting = Effect.gen(function*() {
  const service = yield* connection
  yield* service.run(
    "leader",
    `CREATE TABLE ${SqlProtocol.commits} (client TEXT PRIMARY KEY, opened INTEGER NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID`,
    [],
    false
  )
  return service
})

const decided = (id: number): SqlConnection.Request => ({ id, at: 1_000 + id, undecided: false })
const undecided = (id: number): SqlConnection.Request => ({ id, at: 1_000 + id, undecided: true })

const ids = (service: SqlConnection.Service) =>
  Effect.map(service.run("reader", "SELECT id FROM t ORDER BY id", [], false), ({ rows }) => rows)

const receipts = (service: SqlConnection.Service) =>
  Effect.map(
    service.run("reader", `SELECT client, opened, at FROM ${SqlProtocol.commits} ORDER BY client`, [], false),
    ({ rows }) => rows
  )

const tagOf = <A, E extends { readonly _tag: string }>(effect: Effect.Effect<A, E>) =>
  Effect.map(Effect.flip(effect), (error) => error._tag)

describe("SqlConnection receipts", () => {
  it.effect("runs a request's write outside a transaction inside one with its receipt, and returns its rows", () =>
    Effect.gen(function*() {
      const service = yield* receipting
      expect(yield* service.run("a", "INSERT INTO t (id) VALUES (1) RETURNING id", [], false, decided(4))).toEqual({
        rows: [{ id: 1 }],
        open: false
      })
      expect(yield* ids(service)).toEqual([{ id: 1 }])
      expect(yield* receipts(service)).toEqual([{ client: "a", opened: 4, at: 1_004 }])
    }).pipe(Effect.scoped))

  it.effect("writes no receipt for a read, which commits nothing", () =>
    Effect.gen(function*() {
      const service = yield* receipting
      expect(yield* service.run("a", "SELECT 1 AS one", [], false, decided(0))).toEqual({
        rows: [{ one: 1 }],
        open: false
      })
      expect(yield* receipts(service)).toEqual([])
    }).pipe(Effect.scoped))

  it.effect("receipts a transaction a request opens at once, inside it, whether a later request or the same one commits it", () =>
    Effect.gen(function*() {
      const service = yield* receipting
      expect(yield* service.run("a", "BEGIN IMMEDIATE", [], false, decided(0))).toEqual({ rows: [], open: true })
      yield* service.run("a", "INSERT INTO t (id) VALUES (1)", [], true, decided(1))
      yield* service.run("a", "COMMIT", [], true, decided(2))
      yield* service.run("b", "BEGIN; INSERT INTO t (id) VALUES (2); COMMIT", [], false, decided(7))
      yield* service.run("c", "SAVEPOINT s; INSERT INTO t (id) VALUES (3); RELEASE s", [], false, decided(9))
      expect(yield* ids(service)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
      expect(yield* receipts(service)).toEqual([
        { client: "a", opened: 0, at: 1_000 },
        { client: "b", opened: 7, at: 1_007 },
        { client: "c", opened: 9, at: 1_009 }
      ])
    }).pipe(Effect.scoped))

  it.effect("commits all of a wrapped request or none of it", () =>
    Effect.gen(function*() {
      const service = yield* receipting
      const duplicate = yield* tagOf(
        service.run("a", "INSERT INTO t (id) VALUES (1); INSERT INTO t (id) VALUES (1)", [], false, decided(0))
      )
      expect(duplicate).toBe("SqlError")
      // A request that writes outside a transaction and opens one of its own fails as a nested BEGIN does.
      const nested = yield* tagOf(service.run("a", "INSERT INTO t (id) VALUES (2); BEGIN", [], false, decided(1)))
      expect(nested).toBe("SqlError")
      expect(service.isOpen("a")).toBe(false)
      expect(yield* ids(service)).toEqual([])
      expect(yield* receipts(service)).toEqual([])
    }).pipe(Effect.scoped))

  it.effect("commits a wrapped request's own COMMIT with its receipt, and leaves a transaction it opens after that open", () =>
    Effect.gen(function*() {
      const service = yield* receipting
      expect(yield* service.run("a", "INSERT INTO t (id) VALUES (1); COMMIT", [], false, decided(0))).toEqual({
        rows: [],
        open: false
      })
      expect(yield* service.run("a", "INSERT INTO t (id) VALUES (2); COMMIT; SAVEPOINT s", [], false, decided(1)))
        .toEqual({ rows: [], open: true })
      yield* service.run("a", "INSERT INTO t (id) VALUES (3); RELEASE s", [], true, decided(2))
      expect(yield* ids(service)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
      expect(yield* receipts(service)).toEqual([{ client: "a", opened: 1, at: 1_001 }])
    }).pipe(Effect.scoped))

  it.effect("refuses a change that would commit without a receipt once some of the request committed, and rolls it back", () =>
    Effect.gen(function*() {
      const service = yield* receipting
      const outside = yield* tagOf(
        service.run(
          "a",
          "BEGIN; INSERT INTO t (id) VALUES (1); COMMIT; INSERT INTO t (id) VALUES (2)",
          [],
          false,
          decided(0)
        )
      )
      expect(outside).toBe("@smthrs/platform-browser/TransactionUnrecorded")
      const wrapped = yield* tagOf(
        service.run("b", "INSERT INTO t (id) VALUES (3); COMMIT; INSERT INTO t (id) VALUES (4)", [], false, decided(0))
      )
      expect(wrapped).toBe("@smthrs/platform-browser/TransactionUnrecorded")
      yield* service.run("c", "BEGIN IMMEDIATE", [], false, decided(0))
      const continuing = yield* tagOf(
        service.run("c", "INSERT INTO t (id) VALUES (5); COMMIT; INSERT INTO t (id) VALUES (6)", [], true, decided(1))
      )
      expect(continuing).toBe("@smthrs/platform-browser/TransactionUnrecorded")
      expect(yield* ids(service)).toEqual([{ id: 1 }, { id: 3 }, { id: 5 }])
    }).pipe(Effect.scoped))

  it.effect("commits nothing of an undecided request, rolling back what it left open, and still runs its reads", () =>
    Effect.gen(function*() {
      const service = yield* receipting
      expect(yield* tagOf(service.run("a", "INSERT INTO t (id) VALUES (1)", [], false, undecided(0)))).toBe(
        "@smthrs/platform-browser/TransactionUndecided"
      )
      expect(
        yield* tagOf(
          service.run("a", "SAVEPOINT s; INSERT INTO t (id) VALUES (2); RELEASE s", [], false, undecided(0))
        )
      ).toBe("@smthrs/platform-browser/TransactionUndecided")
      expect(service.isOpen("a")).toBe(false)
      expect(yield* service.run("a", "SELECT count(*) AS n FROM t", [], false, undecided(0))).toEqual({
        rows: [{ n: 0 }],
        open: false
      })
      // Opening a transaction commits nothing; its later statements are decided.
      expect(yield* service.run("a", "BEGIN IMMEDIATE", [], false, undecided(0))).toEqual({ rows: [], open: true })
      yield* service.run("a", "INSERT INTO t (id) VALUES (3)", [], true, decided(1))
      yield* service.run("a", "COMMIT", [], true, decided(2))
      expect(yield* ids(service)).toEqual([{ id: 3 }])
    }).pipe(Effect.scoped))

  it.effect("rolls back a change whose receipt it can't write, inside a transaction or out", () =>
    Effect.gen(function*() {
      const service = yield* connection
      expect(yield* tagOf(service.run("a", "BEGIN IMMEDIATE", [], false, decided(0)))).toBe(
        "@smthrs/platform-browser/TransactionUnrecorded"
      )
      expect(service.isOpen("a")).toBe(false)
      expect(yield* tagOf(service.run("a", "INSERT INTO t (id) VALUES (1)", [], false, decided(1)))).toBe(
        "@smthrs/platform-browser/TransactionUnrecorded"
      )
      // The leader's own statements need no receipt.
      yield* service.run("leader", "INSERT INTO t (id) VALUES (2)", [], false)
      expect(yield* ids(service)).toEqual([{ id: 2 }])
    }).pipe(Effect.scoped))
})
