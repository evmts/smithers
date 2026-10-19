import { makeWorker } from "@livestore/adapter-web/worker"
import { makeWsSync } from "@livestore/sync-cf/client"
import { schema } from "../features/chat/schema"

// The store's own worker: SQLite in the browser, synced over a WebSocket to the Worker's Durable Object.
makeWorker({
  schema,
  sync: { backend: makeWsSync({ url: `${globalThis.location.origin}/sync` }) },
})
