import { Effect } from "effect"
import { type Page, reload } from "../../page"
import { retry, wentOffline } from "./actions"
import type { ChatStore } from "./store"

// The browser's connectivity events on `target` (the window), bound while the scope is open, each running its action
// with the services it was bound with:
// - `offline`: the pill says Offline at once;
// - `online`: chat syncs and sends at once instead of waiting out its backoff;
// - `pageshow` from the back/forward cache: the page reloads, because the device store's connections closed when it
//   was hidden (TanStack DB's browser persistence README).
export const bindConnectivity = Effect.fnUntraced(function* (target: EventTarget) {
  const run = Effect.runSyncWith(yield* Effect.context<ChatStore | Page>())
  const onOffline = () => run(wentOffline)
  const onOnline = () => run(retry("online"))
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) run(reload)
  }
  const bindings: ReadonlyArray<readonly [string, (event: Event) => void]> = [
    ["offline", onOffline],
    ["online", onOnline],
    ["pageshow", onPageShow],
  ]
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      for (const [type, listener] of bindings) target.addEventListener(type, listener)
    }),
    () =>
      Effect.sync(() => {
        for (const [type, listener] of bindings) target.removeEventListener(type, listener)
      }),
  )
})
