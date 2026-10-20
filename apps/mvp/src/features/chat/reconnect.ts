import { Effect } from "effect"
import { Boundary } from "../../lib/runtime"
import { retrySync } from "./actions"
import { ChatStore } from "./store"

// When the browser comes back online, chat syncs again at once instead of waiting out Electric's backoff (up to 10 s),
// and a sync that failed while offline retries. `target` is the window; the listener is bound while the scope is open.
export const reconnectOnline = Effect.fnUntraced(function* (target: EventTarget) {
  const boundary = yield* Boundary
  const store = yield* ChatStore
  const onOnline = () => boundary.runSync(Effect.provideService(retrySync("online"), ChatStore, store))
  yield* Effect.acquireRelease(
    Effect.sync(() => target.addEventListener("online", onOnline)),
    () => Effect.sync(() => target.removeEventListener("online", onOnline)),
  )
})
