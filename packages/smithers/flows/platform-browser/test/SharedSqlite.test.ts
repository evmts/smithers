/**
 * The app's shared database as tabs see it, against real leaders over Node's
 * own Web Locks and `BroadcastChannel`, on wa-sqlite's in-memory VFS: each
 * leader opens its own connection to one file, as leaders in OPFS do.
 */
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as PubSub from "effect/PubSub"
import * as Scope from "effect/Scope"
import { BrowserRuntime, SharedSqlite, TabChannel, WebLock } from "../src/index.ts"
import * as SqlProtocol from "../src/internal/SqlProtocol.ts"
import * as Engines from "./fixtures/Engines.ts"
import * as MemorySqlite from "./fixtures/MemorySqlite.ts"
import * as Telemetry from "./fixtures/Telemetry.ts"

/** A leader whose engine opens the shared database on `pool`. */
const leaderOver = (name: string, pool: Effect.Success<typeof MemorySqlite.pool>) =>
  Effect.gen(function*() {
    const database = yield* MemorySqlite.open
    return yield* Engines.leader(name, Engines.engineWithApp(name, database, Engines.steps(), pool))
  })

/** A leader, its shared database, and a tab with a table `t`. */
const setup = Effect.gen(function*() {
  const name = Engines.name()
  const pool = yield* MemorySqlite.pool
  const leader = yield* leaderOver(name, pool)
  const tab = yield* Engines.sharedTab(name)
  yield* tab.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, at TEXT, big INTEGER)")
  return { name, pool, leader, tab }
})

/** A tab in a scope of its own, so a case can end it. */
const ownTab = (name: string) =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const tab = yield* Engines.sharedTab(name).pipe(Scope.provide(scope))
    return { tab, close: Scope.close(scope, Exit.void) }
  })

/**
 * A tab that speaks the protocol by hand under one client id: `send` posts a
 * request and waits for its answer, and `ready` waits for a leader to start
 * serving.
 */
const rawTab = (name: string) =>
  Effect.gen(function*() {
    const client = `raw-${crypto.randomUUID()}`
    // Held while the tab lives, as a tab's is, so the leader leaves its transaction open.
    yield* Effect.flatMap(WebLock.WebLock, (locks) => locks.hold(SqlProtocol.clientLock(name, client)))
    const port = yield* Effect.flatMap(TabChannel.TabChannel, (channels) => channels.open(SqlProtocol.channel(name)))
    const replies = yield* port.subscribe
    const next = (accept: (message: SqlProtocol.Message) => boolean): Effect.Effect<SqlProtocol.Message> =>
      Effect.flatMap(PubSub.take(replies), (input) => {
        const message = SqlProtocol.decode(input)
        return message !== undefined && accept(message) ? Effect.succeed(message) : next(accept)
      })
    return {
      send: (
        request: {
          readonly id: number
          readonly sql: string
          readonly transaction: string | null
          readonly opened?: number
        }
      ) =>
        port.post(SqlProtocol.encode({ _tag: "Execute", client, params: [], ...request })).pipe(
          Effect.andThen(next((message) =>
            (message._tag === "Executed" || message._tag === "Failed") && message.client === client &&
            message.id === request.id
          ))
        ),
      ready: next((message) => message._tag === "Ready")
    }
  }).pipe(Effect.provide(Engines.platform))

describe("SharedSqlite", () => {
  it.live("continues a failed opener on its leader and refuses replay after that leader ends", () =>
    Effect.gen(function*() {
      const { name, pool, leader, tab } = yield* setup
      yield* tab.execute("BEGIN; SELECT * FROM missing").pipe(Effect.flip)
      yield* tab.execute("INSERT INTO t (id) VALUES (1)")
      yield* Engines.close(leader)
      yield* leaderOver(name, pool)
      const failure = yield* tab.execute("COMMIT").pipe(Effect.flip)
      expect(failure.reason._tag).toBe("ConnectionError")
      expect(yield* tab.execute("SELECT count(*) AS n FROM t")).toEqual([{ n: 0 }])
    }).pipe(Effect.scoped))

  it.live("clears transaction state when failed SQL rolls back SQLite's transaction", () =>
    Effect.gen(function*() {
      const { tab } = yield* setup
      yield* tab.execute("BEGIN; INSERT INTO t (id) VALUES (1)")
      yield* tab.execute("INSERT INTO t (id) VALUES (1)").pipe(Effect.flip)
      yield* tab.execute("INSERT OR ROLLBACK INTO t (id) VALUES (1)").pipe(Effect.flip)
      expect(yield* tab.execute("SELECT count(*) AS n FROM t")).toEqual([{ n: 0 }])
    }).pipe(Effect.scoped))

  it.live("tracks and abandons a transaction opened by a failed statement", () =>
    Effect.gen(function*() {
      const { name, tab } = yield* setup
      const doomed = yield* ownTab(name)
      yield* doomed.tab.execute("BEGIN; SELECT * FROM missing").pipe(Effect.flip)
      const read = yield* Effect.forkChild(tab.execute("SELECT count(*) AS n FROM t"))
      yield* Effect.sleep("30 millis")
      expect(read.pollUnsafe()).toBeUndefined()
      yield* doomed.close
      expect(yield* Fiber.join(read)).toEqual([{ n: 0 }])
    }).pipe(Effect.scoped, Effect.timeout("2 seconds")))

  it.live("runs a tab's statements on the leader and returns rows as objects", () =>
    Effect.gen(function*() {
      const { tab } = yield* setup
      const at = new Date("2026-10-20T08:00:00.000Z")
      expect(yield* tab.execute("INSERT INTO t (id, at, big) VALUES (?, ?, ?)", [1, at, 1_760_000_000_000])).toEqual([])
      expect(yield* tab.execute("SELECT id, at, typeof(big) AS kind FROM t")).toEqual([
        { id: 1, at: "2026-10-20T08:00:00.000Z", kind: "integer" }
      ])
    }).pipe(Effect.scoped))

  it.live("fails a statement SQLite refuses with its SqlError, classified by SQLite's code, and keeps serving", () =>
    Effect.gen(function*() {
      const { tab } = yield* setup
      yield* tab.execute("INSERT INTO t (id) VALUES (1)")
      const duplicate = yield* tab.execute("INSERT INTO t (id) VALUES (1)").pipe(Effect.flip)
      expect(duplicate.reason._tag).toBe("ConstraintError")
      const missing = yield* tab.execute("SELECT * FROM missing").pipe(Effect.flip)
      expect(missing._tag).toBe("SqlError")
      expect(String((missing.reason.cause as { readonly message?: unknown }).message)).toContain("no such table")
      expect(yield* tab.execute("SELECT count(*) AS n FROM t")).toEqual([{ n: 1 }])
    }).pipe(Effect.scoped))

  it.live("keeps a tab's transaction its own: another tab waits, and never reads what is not committed", () =>
    Effect.gen(function*() {
      const { name, tab } = yield* setup
      const other = yield* Engines.sharedTab(name)
      yield* tab.execute("BEGIN IMMEDIATE")
      yield* tab.execute("INSERT INTO t (id) VALUES (1)")
      const read = yield* Effect.forkChild(other.execute("SELECT count(*) AS n FROM t"))
      yield* Effect.sleep("50 millis")
      expect(read.pollUnsafe()).toBeUndefined()
      yield* tab.execute("COMMIT")
      expect(yield* Fiber.join(read)).toEqual([{ n: 1 }])
    }).pipe(Effect.scoped))

  it.live("rolls back the transaction of a tab that ends, counts it, and lets the next tab in", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(
      Effect.gen(function*() {
        const { name, tab } = yield* setup
        const doomed = yield* ownTab(name)
        yield* doomed.tab.execute("BEGIN IMMEDIATE")
        yield* doomed.tab.execute("INSERT INTO t (id) VALUES (1)")
        const read = yield* Effect.forkChild(tab.execute("SELECT count(*) AS n FROM t"))
        yield* Effect.sleep("30 millis")
        expect(read.pollUnsafe()).toBeUndefined()
        yield* doomed.close
        expect(yield* Fiber.join(read)).toEqual([{ n: 0 }])
      }).pipe(Effect.scoped)
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(BrowserRuntime.statements, { outcome: "abandoned" })).toBe(1)
    })))
  })

  it.live("runs a transaction again on the next leader when the one holding it ends, and carries on as if nothing happened", () => {
    const telemetry = Telemetry.make()
    const sentinel = "SENTINEL-51c2"
    return telemetry.observed(
      Effect.gen(function*() {
        const { leader, name, pool, tab } = yield* setup
        yield* tab.execute("BEGIN IMMEDIATE")
        expect(yield* tab.execute("SELECT count(*) AS n FROM t")).toEqual([{ n: 0 }])
        yield* tab.execute("INSERT INTO t (id, at) VALUES (?, ?)", [1, sentinel])
        // The leader's tab closes; its connection closes, and SQLite rolls the transaction back.
        yield* Engines.close(leader)
        yield* leaderOver(name, pool)
        // The tab runs the transaction again on the new leader, then this statement: the caller never knows.
        expect(yield* tab.execute(`INSERT INTO t (id) VALUES (2) -- ${sentinel}`)).toEqual([])
        yield* tab.execute("COMMIT")
        expect(yield* tab.execute("SELECT id, at FROM t")).toEqual([{ id: 1, at: sentinel }, { id: 2, at: null }])
      }).pipe(Effect.scoped)
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(BrowserRuntime.statements, { outcome: "lost" })).toBe(1)
      const lines = telemetry.lines("browser.runtime.statement").map((line) => line.annotations)
      expect(lines).toContainEqual(
        expect.objectContaining({ outcome: "lost", "error.type": "@smthrs/platform-browser/TransactionLost" })
      )
      // No SQL, parameter or row reaches telemetry.
      expect(Telemetry.dump(telemetry)).not.toContain(sentinel)
    })))
  })

  it.live("rolls a lost transaction back when it reads otherwise on the next leader, fails the statement, and starts afresh", () =>
    Effect.gen(function*() {
      const { leader, name, pool, tab } = yield* setup
      const other = yield* Engines.sharedTab(name)
      yield* tab.execute("BEGIN IMMEDIATE")
      expect(yield* tab.execute("SELECT count(*) AS n FROM t")).toEqual([{ n: 0 }])
      yield* tab.execute("INSERT INTO t (id) VALUES (1)")
      yield* Engines.close(leader)
      yield* leaderOver(name, pool)
      // Another tab writes first, so the transaction's read would come out otherwise: running it again is refused.
      yield* other.execute("INSERT INTO t (id) VALUES (5)")
      const lost = yield* tab.execute("INSERT INTO t (id) VALUES (2)").pipe(Effect.flip)
      expect(lost.reason._tag).toBe("ConnectionError")
      expect(lost.message).toBe("The transaction ended with the leader that held it")
      // Rolled back: nothing of it stays, and the other tab isn't kept waiting.
      expect(yield* other.execute("SELECT id FROM t")).toEqual([{ id: 5 }])
      // TanStack's driver rolls back after a failure: outside any transaction, SQLite refuses it.
      yield* tab.execute("ROLLBACK").pipe(Effect.flip)
      yield* tab.execute("BEGIN IMMEDIATE")
      yield* tab.execute("INSERT INTO t (id) VALUES (3)")
      yield* tab.execute("COMMIT")
      expect(yield* tab.execute("SELECT id FROM t")).toEqual([{ id: 3 }, { id: 5 }])
    }).pipe(Effect.scoped))

  it.live("runs a lost transaction again across two leaders ending, one mid-way through running it again", () =>
    Effect.gen(function*() {
      const { leader, name, pool, tab } = yield* setup
      yield* tab.execute("BEGIN IMMEDIATE")
      yield* tab.execute("INSERT INTO t (id) VALUES (1)")
      yield* Engines.close(leader)
      const second = yield* leaderOver(name, pool)
      yield* tab.execute("INSERT INTO t (id) VALUES (2)")
      yield* Engines.close(second)
      yield* leaderOver(name, pool)
      yield* tab.execute("INSERT INTO t (id) VALUES (3)")
      yield* tab.execute("COMMIT")
      expect(yield* tab.execute("SELECT id FROM t")).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    }).pipe(Effect.scoped))

  it.live("sends a statement no leader answered to the next leader once it is ready, and serves idle tabs too", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      const pool = yield* MemorySqlite.pool
      const tab = yield* Engines.sharedTab(name)
      const idle = yield* Engines.sharedTab(name)
      const asked = yield* Effect.forkChild(tab.execute("SELECT 1 AS one"))
      yield* Effect.sleep("30 millis")
      expect(asked.pollUnsafe()).toBeUndefined()
      yield* leaderOver(name, pool)
      expect(yield* Fiber.join(asked)).toEqual([{ one: 1 }])
      expect(yield* idle.execute("SELECT 2 AS two")).toEqual([{ two: 2 }])
    }).pipe(Effect.scoped))

  it.live("runs a request posted twice once, answers only its own tab, and ignores what is not a request", () =>
    Effect.gen(function*() {
      const { name, tab } = yield* setup
      const port = yield* Effect.flatMap(TabChannel.TabChannel, (channels) => channels.open(SqlProtocol.channel(name)))
        .pipe(Effect.provide(TabChannel.layer))
      const replies = yield* port.subscribe
      const request = SqlProtocol.encode({
        _tag: "Execute",
        client: "stranger",
        id: 0,
        sql: "INSERT INTO t (id) VALUES (9)",
        params: [],
        transaction: null
      })
      yield* port.post("not a message")
      yield* port.post(request)
      yield* port.post(request)
      const reply = SqlProtocol.decode(yield* PubSub.take(replies))
      expect(reply).toMatchObject({ _tag: "Executed", client: "stranger", id: 0, open: false })
      // The stranger's reply reached this tab too, which ignored it.
      expect(yield* tab.execute("SELECT id FROM t")).toEqual([{ id: 9 }])
    }).pipe(Effect.scoped))

  it.live("answers a statement that committed its transaction as the leader ended as committed, and never runs it twice", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(
      Effect.gen(function*() {
        const { leader, name, pool, tab } = yield* setup
        // A tab speaking the protocol by hand, so the old leader's answer to its COMMIT can go unread.
        const raw = yield* rawTab(name)
        const begun = yield* raw.send({ id: 0, sql: "BEGIN IMMEDIATE", transaction: null })
        expect(begun).toMatchObject({ _tag: "Executed", open: true })
        const held = (begun as { readonly leader: string }).leader
        yield* raw.send({ id: 1, sql: "INSERT INTO t (id) VALUES (1)", transaction: held, opened: 0 })
        const commit = { id: 2, sql: "COMMIT", transaction: held, opened: 0 }
        expect(yield* raw.send(commit)).toMatchObject({ _tag: "Executed", open: false })
        yield* Engines.close(leader)
        yield* leaderOver(name, pool)
        yield* raw.ready
        // The tab never saw that answer, so it sends the COMMIT again: the new leader says it committed.
        expect(yield* raw.send(commit)).toMatchObject({ _tag: "Executed", rows: [], open: false })
        expect(yield* tab.execute("SELECT id FROM t")).toEqual([{ id: 1 }])
      }).pipe(Effect.scoped)
    ).pipe(Effect.andThen(Effect.sync(() => {
      expect(telemetry.count(BrowserRuntime.statements, { outcome: "committed" })).toBe(1)
    })))
  })

  it.live("refuses a statement of a transaction an ended leader held when it didn't commit, or says nothing of its start", () =>
    Effect.gen(function*() {
      const { leader, name, pool } = yield* setup
      const raw = yield* rawTab(name)
      const begun = yield* raw.send({ id: 0, sql: "BEGIN IMMEDIATE", transaction: null })
      const held = (begun as { readonly leader: string }).leader
      yield* raw.send({ id: 1, sql: "INSERT INTO t (id) VALUES (1)", transaction: held, opened: 0 })
      yield* Engines.close(leader)
      yield* leaderOver(name, pool)
      yield* raw.ready
      const lost = { _tag: "Failed", error: "@smthrs/platform-browser/TransactionLost" }
      expect(yield* raw.send({ id: 2, sql: "COMMIT", transaction: held, opened: 0 })).toMatchObject(lost)
      expect(yield* raw.send({ id: 3, sql: "COMMIT", transaction: held })).toMatchObject(lost)
      expect(yield* raw.send({ id: 4, sql: "SELECT count(*) AS n FROM t", transaction: null })).toMatchObject({
        rows: [{ n: 0 }]
      })
    }).pipe(Effect.scoped))

  it.live("runs transactions, and runs a lost one again, when a table of the tab's own stands where the leader records them", () => {
    const telemetry = Telemetry.make()
    return telemetry.observed(
      Effect.gen(function*() {
        const { leader, name, pool, tab } = yield* setup
        yield* tab.execute(`DROP TABLE ${SqlProtocol.commits}`)
        yield* tab.execute(`CREATE TABLE ${SqlProtocol.commits} (x INTEGER)`)
        yield* Engines.close(leader)
        const second = yield* leaderOver(name, pool)
        yield* tab.execute("BEGIN IMMEDIATE")
        yield* tab.execute("INSERT INTO t (id) VALUES (1)")
        yield* Engines.close(second)
        yield* leaderOver(name, pool)
        yield* tab.execute("COMMIT")
        expect(yield* tab.execute("SELECT id FROM t")).toEqual([{ id: 1 }])
      }).pipe(Effect.scoped)
    ).pipe(Effect.andThen(Effect.sync(() => {
      const lines = telemetry.lines("browser.runtime.statement").map((line) => line.annotations)
      expect(lines.filter((line) => line.outcome === "unrecorded").length).toBeGreaterThanOrEqual(3)
    })))
  })

  it.live("refuses statements when the leader's engine opened no shared database", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      yield* Engines.leader(name, Engines.engine(name, yield* MemorySqlite.open, Engines.steps()))
      const refused = yield* Effect.flatMap(SharedSqlite.SharedSqlite, (tab) => tab.execute("SELECT 1")).pipe(
        Effect.provide(SharedSqlite.layer({ name })),
        Effect.flip
      )
      expect(refused._tag).toBe("SqlError")
      expect(refused.reason.cause).toMatchObject({ name: "@smthrs/platform-browser/DatabaseUnavailable" })
    }).pipe(Effect.scoped))
})

describe("SharedSqlite.open", () => {
  it.live("resolves once a leader answers, runs statements as Promises, and closes", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      yield* leaderOver(name, yield* MemorySqlite.pool)
      const database = yield* Effect.promise(() => SharedSqlite.open({ name }))
      const rows = yield* Effect.promise(() => database.execute<{ readonly two: number }>("SELECT ? AS two", [2]))
      expect(rows).toEqual([{ two: 2 }])
      const refused = yield* Effect.promise(() => database.execute("SELECT * FROM missing").catch((error) => error))
      expect(refused).toMatchObject({ name: "SQLiteError", message: "no such table: missing", code: 1 })
      yield* Effect.promise(() => database.close())
      const state = yield* Effect.promise(() => navigator.locks.query())
      expect((state.held ?? []).some((lock) => lock.name?.startsWith(`${name}/sql/`))).toBe(false)
    }).pipe(Effect.scoped))

  it.live("rejects a statement SQLite refuses with SQLite's own message and code, as wa-sqlite does", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      yield* leaderOver(name, yield* MemorySqlite.pool)
      const database = yield* Effect.promise(() => SharedSqlite.open({ name }))
      yield* Effect.promise(() => database.execute("CREATE TABLE t (id INTEGER)"))
      yield* Effect.promise(() => database.execute("ALTER TABLE t ADD COLUMN c TEXT"))
      // TanStack DB's persistence adds a column and treats exactly this message as "already there".
      const duplicate = yield* Effect.promise(() =>
        database.execute("ALTER TABLE t ADD COLUMN c TEXT").then(() => undefined, (error: unknown) => error)
      )
      expect(duplicate).toBeInstanceOf(SharedSqlite.SqliteError)
      expect(duplicate).toMatchObject({ message: "duplicate column name: c", code: 1 })
      expect((duplicate as Error).cause).toMatchObject({ _tag: "SqlError" })
      yield* Effect.promise(() => database.close())
    }).pipe(Effect.scoped))

  it.live("rejects a statement SQLite never saw with the SqlError's message and no code", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      const pool = yield* MemorySqlite.pool
      const leader = yield* leaderOver(name, pool)
      const database = yield* Effect.promise(() => SharedSqlite.open({ name }))
      const other = yield* Effect.promise(() => SharedSqlite.open({ name }))
      yield* Effect.promise(() => database.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)"))
      yield* Effect.promise(() => database.execute("BEGIN IMMEDIATE"))
      yield* Effect.promise(() => database.execute("SELECT count(*) AS n FROM t"))
      yield* Engines.close(leader)
      yield* leaderOver(name, pool)
      yield* Effect.promise(() => other.execute("INSERT INTO t (id) VALUES (1)"))
      const lost = yield* Effect.promise(() =>
        database.execute("SELECT 1").then(() => undefined, (error: unknown) => error)
      )
      expect(lost).toBeInstanceOf(SharedSqlite.SqliteError)
      expect(lost).toMatchObject({ message: "The transaction ended with the leader that held it", code: undefined })
      yield* Effect.promise(() => Promise.all([database.close(), other.close()]))
    }).pipe(Effect.scoped))

  it.live("rejects when no leader answers in time, and lets go of what it opened", () =>
    Effect.gen(function*() {
      const name = Engines.name()
      const refused = yield* Effect.promise(() =>
        SharedSqlite.open({ name, within: "50 millis" }).then(() => undefined, (error: unknown) => error)
      )
      expect(refused).toMatchObject({ _tag: "SqlError", reason: { _tag: "ConnectionError" } })
      const state = yield* Effect.promise(() => navigator.locks.query())
      expect((state.held ?? []).some((lock) => lock.name?.startsWith(`${name}/sql/`))).toBe(false)
    }))
})
