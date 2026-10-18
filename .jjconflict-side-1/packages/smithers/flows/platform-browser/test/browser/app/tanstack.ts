/**
 * TanStack DB's browser persistence on `SharedSqlite`, composed as an app
 * composes it: this tab's engine worker, the shared database as the
 * persistence's `{ execute, close }`, TanStack's tab coordinator, and several
 * persisted collections on one persistence. Exposed as `window.tanstackHarness`.
 */
import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  persistedCollectionOptions
} from "@tanstack/browser-db-sqlite-persistence"
import { createCollection } from "@tanstack/db"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { BrowserEngine, SharedSqlite } from "../../../src/index.ts"

interface Row {
  readonly id: string
  readonly value: number
}

const names = ["preferences", "chat-unsent", "chat-messages"] as const

const runtime = ManagedRuntime.make(BrowserEngine.layer({
  name: "browser-test",
  worker: () => new Worker("/worker.js", { type: "module" })
}))
await runtime.runPromise(BrowserEngine.BrowserEngine)

const persistence = createBrowserWASQLitePersistence({
  database: await SharedSqlite.open({ name: "browser-test" }),
  coordinator: new BrowserCollectionCoordinator({ dbName: "browser-test" })
})
const collections = names.map((id) =>
  createCollection(
    persistedCollectionOptions<Row, string>({ id, getKey: (row) => row.id, persistence, schemaVersion: 1 })
  )
)

Object.assign(globalThis, {
  tanstackHarness: {
    /** Restores every collection, then reports each one's status and rows. */
    read: async () => {
      await Promise.all(collections.map((collection) => collection.preload()))
      return collections.map((collection) => ({
        status: collection.status,
        rows: [...collection.values()].map(({ id, value }) => ({ id, value })).sort((a, b) => a.id.localeCompare(b.id))
      }))
    },
    /** Inserts `id` into every collection and waits until each is persisted. */
    insert: async (id: string) => {
      for (const [index, collection] of collections.entries()) {
        await collection.insert({ id, value: index }).isPersisted.promise
      }
    }
  }
})
