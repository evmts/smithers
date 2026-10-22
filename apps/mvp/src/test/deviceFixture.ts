import { tempDirectory } from "./tempDirectory"
// Test support: a device store and outbox built from a deployed build's fixture (src/device/fixtures/<build>.json),
// through TanStack DB's own persistence over a SQLite file in Node, at the versions that build wrote. The migration
// suites bring it forward and open it as this build does.
import { Collection, Migrations, Persistence } from "@smthrs/effect-tanstack-db"
import { createBrowserWASQLitePersistence } from "@tanstack/browser-db-sqlite-persistence"
import { Effect, Schema, type Scope } from "effect"
import { join } from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"

/** A deployed build's device, as its fixture records it. */
export interface Fixture {
  readonly build: string
  readonly collections: Readonly<
    Record<
      string,
      {
        readonly kind: "local" | "synced"
        readonly version: number
        readonly key: string
        readonly rows: ReadonlyArray<Record<string, unknown>>
      }
    >
  >
  /** The outbox's storage, key to value, as @tanstack/offline-transactions stored it. */
  readonly outbox: Readonly<Record<string, string>>
}

/** Any row, as stored: the fixture's rows are checked by the suites, not here. */
const AnyRow = Schema.Record(Schema.String, Schema.Unknown)

/** A SQLite file in Node, as TanStack DB's browser persistence reads a database. */
export const sqlite = (path: string) => {
  const database = new DatabaseSync(path)
  return {
    execute: async <T>(sql: string, params: ReadonlyArray<unknown> = []): Promise<ReadonlyArray<T>> => {
      const statement = database.prepare(sql)
      if (statement.columns().length > 0) return statement.all(...(params as Array<SQLInputValue>)) as Array<T>
      statement.run(...(params as Array<SQLInputValue>))
      return []
    },
    close: () => database.close()
  }
}

/**
 * A device store that can't store: `Persistence.layer` over `path`, as `persistenceOn`, whose writes of rows fail once
 * `failing` is set, as a full disk or a closed database fails them. Opening and reading still work.
 */
export const faultyPersistenceOn = (path: string, registry?: Migrations.Registry) => {
  const state = { failing: false }
  const layer = Persistence.layer({
    open: () => {
      const database = sqlite(path)
      return {
        ...database,
        execute: <T>(sql: string, params?: ReadonlyArray<unknown>) =>
          state.failing && /^\s*(insert|update|delete|replace)\b/i.test(sql)
            ? Promise.reject(new Error("SQLITE_FULL: database or disk is full"))
            : database.execute<T>(sql, params)
      }
    },
    make: (database) => createBrowserWASQLitePersistence({ database }),
    ...(registry === undefined ? {} : { registry })
  })
  return { layer, failWrites: () => void (state.failing = true) }
}

/** `Persistence.layer` over `path`, with `registry` when given, as the app's is. */
export const persistenceOn = (path: string, registry?: Migrations.Registry) =>
  Persistence.layer({
    open: () => sqlite(path),
    make: (database) => createBrowserWASQLitePersistence({ database }),
    ...(registry === undefined ? {} : { registry })
  })

// A sync source that writes `rows` once started and is ready: the server's rows, as Electric delivers them.
const source = (rows: ReadonlyArray<object>) => ({
  sync: ({ begin, write, commit, markReady }: {
    readonly begin: () => void
    readonly write: (message: { readonly type: "insert"; readonly value: object }) => void
    readonly commit: () => void
    readonly markReady: () => void
  }) => {
    if (rows.length > 0) {
      begin()
      for (const row of rows) write({ type: "insert", value: row })
      commit()
    }
    markReady()
  }
})

/** Synced collection `id` at `schemaVersion`, filled by a source of `rows`. */
export const syncedCollection = <A extends object>(
  id: string,
  schema: Schema.Codec<A, A>,
  schemaVersion: number,
  rows: ReadonlyArray<A>,
  getKey: (row: A) => string
) =>
  Collection.make(schema, { id, getKey, sync: source(rows) } as never, { persist: { schemaVersion } }) as Effect.Effect<
    Collection.Collection<A, string>,
    never,
    Scope.Scope | Persistence.Persistence
  >

/** A row as stored: TanStack DB's virtual `$` fields left out. */
export const plain = (row: object) =>
  Object.fromEntries(Object.entries(row).filter(([field]) => !field.startsWith("$")))

/**
 * Writes `fixture`'s collections into a new SQLite file, each at the version its build stored it, and answers the
 * file's path and the outbox's storage as a map.
 */
export const deviceFrom = async (fixture: Fixture) => {
  const path = join(tempDirectory("mvp-device-"), "device.sqlite")
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function*() {
        for (const [id, collection] of Object.entries(fixture.collections)) {
          const getKey = (row: Record<string, unknown>) => String(row[collection.key])
          if (collection.kind === "synced") {
            yield* (yield* syncedCollection(id, AnyRow, collection.version, collection.rows, getKey)).preload
            continue
          }
          const stored = yield* Collection.persisted({ id, schema: AnyRow, getKey, schemaVersion: collection.version })
          yield* stored.restored
          if (collection.rows.length > 0) yield* Effect.orDie((yield* stored.insert(collection.rows)).persisted)
        }
      })
    ).pipe(Effect.provide(persistenceOn(path)))
  )
  return { path, outbox: new Map(Object.entries(fixture.outbox)) }
}

/** `apply` over the file at `path`, as the leader's `device/prepare` runs it. */
export const prepare = (path: string, registry: Migrations.Registry) => {
  const database = sqlite(path)
  return Effect.runPromise(
    Migrations.apply(registry, Migrations.promiseSql(database)).pipe(
      Effect.ensuring(Effect.sync(() => database.close()))
    )
  )
}

/** The rows set aside in `device_kept`. */
export const keptRows = async (path: string) => {
  const database = sqlite(path)
  try {
    const tables = await database.execute("SELECT name FROM sqlite_master WHERE name = 'device_kept'")
    if (tables.length === 0) return []
    return await database.execute<{ collection_id: string; key: string; reason: string }>(
      "SELECT collection_id, key, reason FROM device_kept ORDER BY collection_id, key"
    )
  } finally {
    database.close()
  }
}
