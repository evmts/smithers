import { Button, ChatComposer } from "@smthrs/ui"
import { useAppStore } from "../../../livestore/store"
import { ask, closeComposer, openComposer, setDraft } from "../actions"
import { awaiting$, composer$ } from "../queries"
import { QUESTION_MAX_LENGTH } from "../schema"

const SHORTCUT = "Meta+K Control+K"

// The docked composer when open; the Chat ⌘K button when hidden.
export function Composer() {
  const store = useAppStore()
  const { open, draft } = store.useQuery(composer$)
  const answering = store.useQuery(awaiting$(store.sessionId)).length > 0
  if (!open) {
    return (
      <Button variant="outline" aria-keyshortcuts={SHORTCUT} onClick={() => openComposer(store)}>
        Chat <kbd>⌘K</kbd>
      </Button>
    )
  }
  return (
    <ChatComposer
      docked
      value={draft}
      onValueChange={(text) => setDraft(store, text)}
      onSubmit={(text) => void ask(store, text)}
      lifecycleStatus={answering ? "streaming" : "ready"}
      placeholder="Message Smithers"
      inputAriaLabel="Message Smithers"
      textareaProps={{ autoFocus: true, maxLength: QUESTION_MAX_LENGTH }}
      actions={
        <Button variant="ghost" size="sm" aria-keyshortcuts={SHORTCUT} onClick={() => closeComposer(store)}>
          Hide <kbd>⌘K</kbd>
        </Button>
      }
    />
  )
}
