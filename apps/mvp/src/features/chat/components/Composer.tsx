import { Button, ChatComposer } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useChat } from "../../../AppContext"
import { useCommands } from "../../commands/components/CommandsContext"
import { MAX_QUESTION_LENGTH } from "../contract"

const SHORTCUT = "Meta+K Control+K"

// The docked composer when open; the Chat ⌘K button when hidden. It always sends: a question asked while an answer
// streams, or offline, queues behind it. Typing `/` lists the slash commands this person may run
// (docs/features/slash-commands.md); the commands layer decides what the line does.
export function Composer() {
  const { queries, actions } = useChat()
  const commands = useCommands()
  const { data: composer } = useLiveQuery(queries.composer)
  const { data: menu } = useLiveQuery(commands.queries.menu)
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
      onValueChange={commands.actions.type}
      onSubmit={commands.actions.submit}
      completions={{
        label: menu?.label ?? "",
        items: menu?.items ?? [],
        highlighted: menu?.highlighted ?? 0,
        onHighlight: commands.actions.highlight,
        onChoose: commands.actions.choose,
        onDismiss: commands.actions.dismiss,
      }}
      statusText={menu?.refusal}
      lifecycleStatus="ready"
      placeholder="Message Smithers"
      inputAriaLabel="Message Smithers"
      textareaProps={{
        autoFocus: true,
        maxLength: MAX_QUESTION_LENGTH,
        "data-draft": composer.saved ? "saved" : "unsaved",
      }}
      actions={
        <Button variant="ghost" size="sm" aria-keyshortcuts={SHORTCUT} onClick={actions.closeComposer}>
          Hide <kbd>⌘K</kbd>
        </Button>
      }
    />
  )
}
