import { Button, ChatMessage, ChatTranscript, MessageResponse, Wordmark } from "@smthrs/ui"
import { useLiveQuery, useLiveSuspenseQuery } from "@tanstack/react-db"
import { useApp } from "../../../AppContext"
import { loadEarlier } from "../actions"

// Suspends until the conversation's first page: the screen shows AppLoading meanwhile, and AppFailed if it fails.
// "Load earlier" heads it while there may be earlier messages.
export function Conversation() {
  const { chat, run } = useApp()
  const { data: conversation } = useLiveSuspenseQuery(chat.conversation)
  const { data: history } = useLiveQuery(chat.historyState)
  return (
    <ChatTranscript empty={<Wordmark />}>
      {history?.earlier === true ? (
        <Button variant="ghost" size="sm" loading={history.loading} onClick={() => run(loadEarlier)}>
          Load earlier
        </Button>
      ) : null}
      {conversation.map((message) => (
        <ChatMessage
          key={message.id}
          role={message.role}
          pending={message.status === "streaming" && message.text === ""}
          pendingLabel="Smithers is answering"
        >
          {message.role === "assistant" ? (
            <MessageResponse content={message.text} streaming={message.status === "streaming"} />
          ) : (
            message.text
          )}
        </ChatMessage>
      ))}
    </ChatTranscript>
  )
}
