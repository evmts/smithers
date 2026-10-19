import { closeComposer, toggleComposer } from "./actions"

// ⌘K (Ctrl+K) toggles the composer and Esc hides it from anywhere in the window,
// whatever has focus, as in the old app (apps/app/src/mainview/state/controller/controlFocus.ts).
export const installChatShortcuts = (target: Window = window) =>
  target.addEventListener(
    "keydown",
    (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        toggleComposer()
      } else if (event.key === "Escape") closeComposer()
    },
    true,
  )
