/**
 * The leader's connection to the app's shared database: one owner's
 * transaction at a time, decided by SQLite's own autocommit flag.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import { BrowserSqlite } from "../src/index.ts"
import * as SqlConnection from "../src/internal/SqlConnection.ts"
import * as MemorySqlite from "./fixtures/MemorySqlite.ts"

/** A connection over a fresh in-memory database with a table `t`. */
const connection = Effect.gen(function*() {
  const service = yield* SqlConnection.make(yield* MemorySqlite.open)
  yield* service.run("setup", "CREATE TABLE t (id INTEGER PRIMARY KEY)", [], false)
  return service
})

const count = (service: SqlConnection.Service, owner: string) =>
  Effect.map(service.run(owner, "SELECT count(*) AS n FROM t", [], false), ({ rows }) => rows)

describe("SqlConnection", () => {
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
