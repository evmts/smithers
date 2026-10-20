import { Badge, Button, ChatMessage, ChatTranscript, MessageResponse, Wordmark } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useChat } from "../../../AppContext"
import { NOT_SENT, QUEUED } from "../contract"

// The conversation on this device: never a loading state. Until it is restored or synced it is blank, never the empty
// state. "Load earlier" heads it while the device has messages before the window. A queued question is badged only
// while the connection pill shows; an unsent one offers Edit or Retry, and Discard; a failed answer offers Retry.
export function Conversation() {
  const { queries, actions } = useChat()
  const { data: conversation } = useLiveQuery(queries.conversation)
  const { data: history } = useLiveQuery(queries.history)
  const { data: connection } = useLiveQuery(queries.connection)
  const pill = connection !== undefined && connection.status !== "up"
  return (
    <ChatTranscript empty={history?.opened === true ? <Wordmark /> : null}>
      {history?.earlier === true ? (
        <Button variant="ghost" size="sm" onClick={actions.loadEarlier}>
          Load earlier
        </Button>
      ) : null}
      {conversation.map((message) => (
        <ChatMessage
          // One element per message from the moment it shows, so a question syncing or an answer settling doesn't
          // replay the fade-in. Only an unsent question can share its id with a synced row (another message took it).
          key={message.status === "unsent" ? `unsent:${message.id}` : message.id}
          role={message.role}
          data-id={message.id}
          data-state={message.status}
          data-answer={message.status === "streaming" ? "streaming" : undefined}
          pending={message.status === "streaming" && message.text === ""}
          pendingLabel="Smithers is answering"
          meta={
            message.status === "queued" && pill ? (
              <Badge variant="muted">{QUEUED}</Badge>
            ) : message.status === "unsent" ? (
              <>
                <Badge variant="destructive">{NOT_SENT}</Badge>
                {message.sendAgain ? (
                  <Button variant="ghost" size="sm" onClick={() => actions.resendUnsent(message.id)}>
                    Retry
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => actions.editUnsent(message.id)}>
                    Edit
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => actions.discardUnsent(message.id)}>
                  Discard
                </Button>
              </>
            ) : message.status === "failed" ? (
              <Button variant="ghost" size="sm" onClick={() => actions.retryAnswer(message.id)}>
                Retry
              </Button>
            ) : undefined
          }
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
