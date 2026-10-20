import { Badge, Button, ChatMessage, ChatTranscript, CopyButton, MessageResponse, RelativeTime, Wordmark } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Fragment } from "react"
import { useChat } from "../../../AppContext"
import { AnswerStatus } from "../../status/components/AnswerStatus"
import { useStatus } from "../../status/components/StatusContext"
import { ConversationView } from "../../views/components/ConversationView"
import { COPY, EDIT, NOT_SENT, QUEUED } from "../contract"
import { timeOf } from "../view"

// The conversation on this device: never a loading state. Until it is restored or synced it is blank, never the empty
// state. "Load earlier" heads it while the device has messages before the window. A queued question is badged only
// while the connection pill shows, with Edit; an unsent one offers Edit or Retry, and Discard; a failed answer offers
// Retry; a finished message offers Copy. Every message shows when it was asked or written. A view
// (src/features/views) shows where it was added, from its own row. An answer shows its agent status under it
// (src/features/status): its question while it needs you, in place of an empty bubble.
export function Conversation() {
  const { queries, actions } = useChat()
  const { data: statuses } = useLiveQuery(useStatus().queries.statuses)
  // The conversation this tab shows: the branch's on a branch's page (decision 0013 §1), the home one on /app.
  const { data: place } = useLiveQuery(queries.place)
  const shown = queries.of(place?.conversationId)
  const { data: conversation } = useLiveQuery(shown.conversation)
  const { data: history } = useLiveQuery(shown.history)
  const { data: connection } = useLiveQuery(queries.connection)
  const pill = connection !== undefined && connection.status !== "up"
  return (
    <ChatTranscript empty={history?.opened === true ? <Wordmark /> : null}>
      {history?.earlier === true ? (
        <Button variant="ghost" size="sm" onClick={actions.loadEarlier}>
          Load earlier
        </Button>
      ) : null}
      {conversation.map((message) =>
        message.role === "view" ? (
          <ConversationView
            key={message.id}
            id={message.id}
            template={message.template}
            url={message.url}
            {...(place?.conversationId == null ? {} : { conversationId: place.conversationId })}
          />
        ) : (
        // One element per message from the moment it shows, so a question syncing or an answer settling doesn't
        // replay the fade-in. Only an unsent question can share its id with a synced row (another message took it).
        <Fragment key={message.status === "unsent" ? `unsent:${message.id}` : message.id}>
        {message.role === "assistant" && message.text === "" &&
            statuses.find((status) => status.id === message.id)?.state === "needs_you" ? null : (
        <ChatMessage
          role={message.role}
          data-id={message.id}
          data-state={message.status}
          data-answer={message.status === "streaming" ? "streaming" : undefined}
          pending={message.status === "streaming" && message.text === ""}
          pendingLabel="Smithers is answering"
          meta={
            <>
            {timeOf(message) === undefined ? null : <RelativeTime ts={timeOf(message)!} />}
            {message.status === "done" ? (
              <CopyButton variant="ghost" size="sm" onCopy={() => actions.copy(message.id)}>
                {COPY}
              </CopyButton>
            ) : message.status === "queued" && pill ? (
              <>
                <Badge variant="muted">{QUEUED}</Badge>
                <Button variant="ghost" size="sm" onClick={() => actions.edit(message.id)}>
                  {EDIT}
                </Button>
              </>
            ) : message.status === "unsent" ? (
              <>
                <Badge variant="destructive">{NOT_SENT}</Badge>
                {message.sendAgain ? (
                  <Button variant="ghost" size="sm" onClick={() => actions.resendUnsent(message.id)}>
                    Retry
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => actions.editUnsent(message.id)}>
                    {EDIT}
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
            ) : null}
            </>
          }
        >
          {message.role === "assistant" ? (
            <MessageResponse content={message.text} streaming={message.status === "streaming"} />
          ) : (
            message.text
          )}
        </ChatMessage>
        )}
        {message.role === "assistant" ? <AnswerStatus id={message.id} /> : null}
        </Fragment>
        ),
      )}
    </ChatTranscript>
  )
}
