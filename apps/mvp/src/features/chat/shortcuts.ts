import { Effect } from "effect"
import { AppStore } from "../../livestore/AppStore"
import { closeComposer, toggleComposer } from "./actions"
import { composer$ } from "./queries"

// ⌘K (Ctrl+K) toggles the composer and Esc hides it from anywhere in the window, whatever has focus,
// as in the old app (apps/app/src/mainview/state/controller/controlFocus.ts). The listener commits
// synchronously, because ⌘K's browser default must be prevented inside the event.
export const chatShortcuts = Effect.fnUntraced(function* (target: Window) {
  const { store } = yield* AppStore
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      toggleComposer(store, store.query(composer$).open)
    } else if (event.key === "Escape") closeComposer(store)
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => target.addEventListener("keydown", onKeyDown, true)),
    () => Effect.sync(() => target.removeEventListener("keydown", onKeyDown, true)),
  )
})
