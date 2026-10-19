import { makeAdapter } from "@livestore/adapter-node"
import { createStorePromise } from "@livestore/livestore"
import { Effect, Layer } from "effect"
import { schema } from "../features/chat/schema"
import { AppStore, running } from "../livestore/AppStore"

// A real LiveStore in memory: the same schema, events and materializers the browser runs, with no sync.
export const openMemoryStore = (sessionId = "test-session") =>
  createStorePromise({
    schema,
    storeId: `test-${crypto.randomUUID()}`,
    adapter: makeAdapter({ storage: { type: "in-memory" }, sessionId }),
    disableDevtools: true,
  })

// AppStore over a fresh in-memory store, shut down when the scope closes.
export const memoryAppStore = (sessionId?: string) =>
  Layer.effect(
    AppStore,
    Effect.acquireRelease(
      Effect.tryPromise(() => openMemoryStore(sessionId)),
      (store) => Effect.promise(() => store.shutdownPromise()),
    ).pipe(Effect.map(running)),
  )
