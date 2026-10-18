import { Button, ChatComposer } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useChat } from "../../../AppContext"
import { MAX_QUESTION_LENGTH } from "../contract"

const SHORTCUT = "Meta+K Control+K"

// The docked composer when open; the Chat ⌘K button when hidden. It always sends: a question asked while an answer
// streams, or offline, queues behind it.
export function Composer() {
  const { queries, actions } = useChat()
  const { data: composer } = useLiveQuery(queries.composer)
  if (composer?.open !== true) {
    return (
      <Button variant="outline" aria-keyshortcuts={SHORTCUT} onClick={() => actions.openComposer("button")}>
        Chat <kbd>⌘K</kbd>
      </Button>
    )
  }
  return (
    <ChatComposer
      docked
      value={composer.draft}
      onValueChange={actions.setDraft}
      onSubmit={(text) => void actions.ask(text)}
      lifecycleStatus="ready"
      placeholder="Message Smithers"
      inputAriaLabel="Message Smithers"
      textareaProps={{ autoFocus: true, maxLength: MAX_QUESTION_LENGTH }}
      actions={
        <Button variant="ghost" size="sm" aria-keyshortcuts={SHORTCUT} onClick={actions.closeComposer}>
          Hide <kbd>⌘K</kbd>
        </Button>
      }
    />
  )
}
