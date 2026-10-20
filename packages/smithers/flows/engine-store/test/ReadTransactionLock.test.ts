/**
 * A read snapshot of engine state answers while another process holds the
 * store's write lock.
 *
 * `AgentSession.readExecution` read one run's round, wait and parents inside
 * `transaction`, a write transaction. Every health beat of every open run, in
 * every process on one project, took the engine store's write lock and the
 * process's one write permit; a run's lease heartbeat queued behind them, the
 * lease lapsed after 19 s, and the engine interrupted the run mid-step
 * (docs-sync, 2026-10-20). `readTransaction` reads one snapshot without either.
 */
import * as DurableWriter from "@smthrs/database/DurableWriter"
import * as NodeDatabase from "@smthrs/database/node/NodeDatabase"
import { Cause, Effect, Exit, Layer, Option } from "effect"
import * as SqlClient from "effect/sql/SqlClient"
import * as SqlError from "effect/sql/SqlError"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { expect, it } from "vitest"
import * as DurableEngineState from "../src/DurableEngineState.ts"
import * as Migrations from "../src/Migrations.ts"

it("reads one snapshot while another connection holds the write lock; a write transaction cannot", async () => {
  const directory = mkdtempSync(join(tmpdir(), "engine-read-lock-"))
  const filename = join(directory, "engine.db")
  // One retry keeps the refused write transaction fast: the production
  // budget backs off for about 23 s, longer than a lease tolerates.
  const store = Layer.provideMerge(DurableWriter.layer({ maxAttempts: 1 }), NodeDatabase.layer({ filename }))
  const peer = new DatabaseSync(filename)
  try {
    await Effect.runPromise(Effect.scoped(
      Effect.gen(function*() {
        yield* Migrations.run
        const sql = yield* SqlClient.SqlClient
        yield* sql`
        INSERT INTO flows_runs (run_id, status, created_at_ms, state_json, waiting_reason)
        VALUES ('run-1', 'suspended', 0, '{}', 'event')
      `
      }).pipe(Effect.provide(store))
    ))

    const observed = await Effect.runPromise(Effect.scoped(
      Effect.gen(function*() {
        const state = yield* DurableEngineState.make
        // Another process's writer, as a busy project has many.
        peer.exec("BEGIN IMMEDIATE")
        const read = yield* Effect.exit(state.readTransaction(state.waiting("run-1")))
        const written = yield* Effect.exit(state.transaction(state.waiting("run-1")))
        peer.exec("ROLLBACK")
        return { read, written }
      }).pipe(Effect.provide(store))
    ))

    expect(Exit.isSuccess(observed.read)).toBe(true)
    if (Exit.isSuccess(observed.read)) {
      expect(Option.map(observed.read.value, (row) => row.reason)).toEqual(Option.some("event"))
    }
    expect(Exit.isFailure(observed.written)).toBe(true)
  } finally {
    peer.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it("a read snapshot the store can't open dies with the store's error; the body never runs", async () => {
  const directory = mkdtempSync(join(tmpdir(), "engine-read-lock-"))
  const store = Layer.provideMerge(
    DurableWriter.layer({ maxAttempts: 1 }),
    NodeDatabase.layer({ filename: join(directory, "engine.db") })
  )
  const refused = new SqlError.SqlError({
    reason: SqlError.classifySqliteError(Object.assign(new Error("disk I/O error"), { code: "SQLITE_IOERR" }))
  })
  try {
    let ran = false
    const exit = await Effect.runPromise(Effect.scoped(
      Effect.gen(function*() {
        yield* Migrations.run
        const sql = yield* SqlClient.SqlClient
        // A store whose connection can't be reserved, as a database whose disk fails (injected).
        const refusing = new Proxy(sql, {
          get: (target, property) => property === "reserve" ? Effect.fail(refused) : Reflect.get(target, property)
        })
        const state = yield* DurableEngineState.make.pipe(Effect.provideService(SqlClient.SqlClient, refusing))
        return yield* Effect.exit(state.readTransaction(Effect.sync(() => void (ran = true))))
      }).pipe(Effect.provide(store))
    ))

    expect(ran).toBe(false)
    expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
    expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined).toBe(refused)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it("the memory twin's read snapshot answers what its transaction answers", async () => {
  const state = DurableEngineState.makeMemory()
  const read = await Effect.runPromise(state.readTransaction(state.waiting("absent")))
  expect(Option.isNone(read)).toBe(true)
})
