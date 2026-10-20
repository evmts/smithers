import { Effect } from "effect"
import { Boundary } from "../../lib/runtime"
import { closeComposer, toggleComposer } from "./actions"
import { ChatStore } from "./store"

// ⌘K (Ctrl+K) toggles the composer and Esc hides it from anywhere on `target`, whatever has focus, as in the old app
// (apps/app/src/mainview/state/controller/controlFocus.ts). The listener is bound while the scope is open.
// `preventDefault` runs in the listener, because ⌘K's browser default can only be stopped inside the event.
export const chatShortcuts = Effect.fnUntraced(function* (target: EventTarget) {
  const boundary = yield* Boundary
  const store = yield* ChatStore
  const run = (action: Effect.Effect<void, never, ChatStore>) =>
    boundary.runSync(Effect.provideService(action, ChatStore, store))
  const onKeyDown = (event: Event) => {
    // Some keydown events carry no key, such as Chrome's autofill.
    const { key, metaKey, ctrlKey } = event as Partial<KeyboardEvent>
    if (typeof key !== "string") return
    if ((metaKey || ctrlKey) && key.toLowerCase() === "k") {
      event.preventDefault()
      run(toggleComposer("shortcut"))
    } else if (key === "Escape") run(closeComposer)
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => target.addEventListener("keydown", onKeyDown, true)),
    () => Effect.sync(() => target.removeEventListener("keydown", onKeyDown, true)),
  )
})
