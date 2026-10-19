import { makePersistedAdapter } from "@livestore/adapter-web"
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker"
import { StoreRegistry } from "@livestore/livestore"
import { useStore } from "@livestore/react"
import { Effect, Layer } from "effect"
import { unstable_batchedUpdates as batchUpdates } from "react-dom"
import { schema } from "../features/chat/schema"
import { AppStore, running, STORE_ID } from "./AppStore"
import LiveStoreWorker from "./livestore.worker.ts?worker"

// The browser's store: SQLite on OPFS in a worker, shared by the tabs of one browser.
const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

const storeOptions = { storeId: STORE_ID, schema, adapter, batchUpdates }

export const storeRegistry = new StoreRegistry()

// The store in React components.
export const useAppStore = () => useStore(storeOptions)

// The store in the browser's Effect program: the instance React renders, since a tab holds one store.
export const appStoreLive = Layer.effect(
  AppStore,
  Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => storeRegistry.retain(storeOptions)),
      (release) => Effect.sync(release),
    )
    return running(yield* Effect.tryPromise(async () => storeRegistry.getOrLoadPromise(storeOptions)))
  }),
)
