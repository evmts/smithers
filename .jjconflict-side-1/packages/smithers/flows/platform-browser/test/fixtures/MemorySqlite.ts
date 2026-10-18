/**
 * A real wa-sqlite database on wa-sqlite's in-memory VFS: the happy-path
 * backend for `BrowserSqlite.make` under Node, where OPFS does not exist.
 */
import * as WaSqlite from "@journeyapps/wa-sqlite"
import SQLiteESMFactory from "@journeyapps/wa-sqlite/dist/wa-sqlite.mjs"
import { MemoryVFS } from "@journeyapps/wa-sqlite/src/examples/MemoryVFS.js"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import type { BrowserSqlite } from "../../src/index.ts"
import { BrowserSqlite as Sqlite } from "../../src/index.ts"

const require = createRequire(import.meta.url)

/** The bytes of the synchronous wa-sqlite build the package ships. */
export const wasm: Uint8Array<ArrayBuffer> = new Uint8Array(
  readFileSync(require.resolve("@journeyapps/wa-sqlite/dist/wa-sqlite.wasm"))
)

/** The build as a worker hands it over: lazy imports of the JavaScript and the bytes. */
export const build: BrowserSqlite.Build = {
  module: () => import("@journeyapps/wa-sqlite/dist/wa-sqlite.mjs"),
  wasm: () => Promise.resolve(wasm)
}

/** Opens a fresh in-memory database and closes it with the scope. */
export const open = Effect.gen(function*() {
  const module = yield* Effect.promise(() => SQLiteESMFactory({ wasmBinary: wasm }))
  const sqlite3 = WaSqlite.Factory(module)
  sqlite3.vfs_register(
    new (MemoryVFS as unknown as new(name: string, module: unknown) => SQLiteVFS)("memory", module),
    false
  )
  const db = yield* Effect.acquireRelease(
    Effect.promise(() => sqlite3.open_v2("engine.db", undefined, "memory")),
    (db) => Effect.promise(() => sqlite3.close(db))
  )
  return { sqlite3, db } satisfies BrowserSqlite.Database
})

/** A `SqlClient` over a fresh in-memory database. */
export const layer: Layer.Layer<SqlClient.SqlClient> = Layer.unwrap(Effect.map(open, (database) => over(database)))

/**
 * A `SqlClient` layer over an already open database, so two engines built one
 * after the other share one store, as two leaders share one OPFS file.
 */
export const over = (database: BrowserSqlite.Database): Layer.Layer<SqlClient.SqlClient> =>
  Layer.effect(SqlClient.SqlClient, Sqlite.make(database)).pipe(Layer.provide(Reactivity.layer))

/**
 * One build with wa-sqlite's in-memory VFS registered as `memory`, as a
 * `BrowserSqlite.Sqlite` service: every connection that opens a file by the
 * same name on it sees the same database, as two leaders see one OPFS file.
 */
export const pool = Effect.gen(function*() {
  const module = yield* Effect.promise(() => SQLiteESMFactory({ wasmBinary: wasm }))
  const sqlite3 = WaSqlite.Factory(module)
  sqlite3.vfs_register(
    new (MemoryVFS as unknown as new(name: string, module: unknown) => SQLiteVFS)("memory", module),
    false
  )
  return Sqlite.Sqlite.of({ sqlite3, vfs: "memory" })
})
