import { Button, ChatComposer } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useApp } from "../../../AppContext"
import { ask, closeComposer, openComposer, setDraft } from "../actions"
import { QUESTION_MAX_LENGTH } from "../schema"

const SHORTCUT = "Meta+K Control+K"

// The docked composer when open; the Chat ⌘K button when hidden.
export function Composer() {
  const { chat, run } = useApp()
  const { data: composer } = useLiveQuery(chat.composerState)
  const { data: waiting } = useLiveQuery(chat.waiting)
  if (composer?.open !== true) {
    return (
      <Button variant="outline" aria-keyshortcuts={SHORTCUT} onClick={() => run(openComposer("button"))}>
        Chat <kbd>⌘K</kbd>
      </Button>
    )
  }
  return (
    <ChatComposer
      docked
      value={composer.draft}
      onValueChange={(text) => run(setDraft(text))}
      onSubmit={(text) => void run(ask(text))}
      lifecycleStatus={waiting === undefined ? "ready" : "streaming"}
      placeholder="Message Smithers"
      inputAriaLabel="Message Smithers"
      textareaProps={{ autoFocus: true, maxLength: QUESTION_MAX_LENGTH }}
      actions={
        <Button variant="ghost" size="sm" aria-keyshortcuts={SHORTCUT} onClick={() => run(closeComposer)}>
          Hide <kbd>⌘K</kbd>
        </Button>
      }
    />
  )
}
