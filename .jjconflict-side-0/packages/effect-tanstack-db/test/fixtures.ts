import { createBrowserWASQLitePersistence } from "@tanstack/browser-db-sqlite-persistence"
import { Effect, Logger, References, Schema } from "effect"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { Persistence } from "../src/index.ts"

// Rows the suites store, and a logger that records what the package logs.

export const Note = Schema.Struct({ id: Schema.String, text: Schema.String, n: Schema.Number })
export type Note = typeof Note.Type

export const note = (id: string, n: number, text = id): Note => ({ id, text, n })

/** A test's own id, so collections never share TanStack DB's id space. */
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

/** Runs `program` with a logger that records each line's message and annotations, and returns both. */
export const withLogs = async <A, E>(program: Effect.Effect<A, E>) => {
  const logs: Array<
    { readonly message: unknown; readonly level: string; readonly annotations: Record<string, unknown> }
  > = []
  const recorder = Logger.make(({ message, logLevel, fiber }) => {
    logs.push({ message, level: logLevel, annotations: { ...fiber.getRef(References.CurrentLogAnnotations) } })
  })
  const result = await Effect.runPromise(program.pipe(Effect.provide(Logger.layer([recorder]))))
  return { result, logs }
}

/** A SQLite file in Node, as TanStack DB's browser persistence reads a database: `execute` and `close`. */
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

/** A database file of the test's own. */
export const databaseFile = () => join(tmpdir(), `effect-tanstack-db-${crypto.randomUUID()}.sqlite`)

/** `Persistence.layer` over a SQLite file, as a Node host opens it. */
export const persistenceOn = (path: string) =>
  Persistence.layer({
    open: () => sqlite(path),
    make: (database, coordinator) =>
      createBrowserWASQLitePersistence({ database, ...(coordinator ? { coordinator } : {}) })
  })

/** An outbox's storage in memory, shared by the executors a test starts on it: the library's `StorageAdapter`. */
export const memoryStorage = () => {
  const entries = new Map<string, string>()
  return {
    entries,
    get: async (key: string) => entries.get(key) ?? null,
    set: async (key: string, value: string) => void entries.set(key, value),
    delete: async (key: string) => void entries.delete(key),
    keys: async () => [...entries.keys()],
    clear: async () => entries.clear()
  }
}
