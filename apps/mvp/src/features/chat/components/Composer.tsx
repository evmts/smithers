import { Button, ChatComposer } from "@smthrs/ui"
import { closeComposer, openComposer, sendMessage, setDraft } from "../actions"
import { useAnswering, useComposer } from "../queries"

const SHORTCUT = "Meta+K Control+K"

// The docked composer when open; the Chat ⌘K button when hidden.
export function Composer() {
  const { open, draft } = useComposer()
  const answering = useAnswering()
  if (!open) {
    return (
      <Button variant="outline" aria-keyshortcuts={SHORTCUT} onClick={openComposer}>
        Chat <kbd>⌘K</kbd>
      </Button>
    )
  }
  return (
    <ChatComposer
      docked
      value={draft}
      onValueChange={setDraft}
      onSubmit={(text) => void sendMessage(text.trim())}
      lifecycleStatus={answering ? "streaming" : "ready"}
      placeholder="Message Smithers"
      inputAriaLabel="Message Smithers"
      textareaProps={{ autoFocus: true }}
      actions={
        <Button variant="ghost" size="sm" aria-keyshortcuts={SHORTCUT} onClick={closeComposer}>
          Hide <kbd>⌘K</kbd>
        </Button>
      }
    />
  )
}
