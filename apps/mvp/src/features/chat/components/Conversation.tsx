import { TimelineContribution } from "../../timeline/TimelineContribution"
import { Badge, Button, ChatMessage, ChatTranscript, CopyButton, MessageResponse, RelativeTime, Wordmark } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import { Fragment, type ReactNode } from "react"
import { useChat } from "../../../AppContext"
import { AnswerStatus } from "../../status/components/AnswerStatus"
import { AnswerDrafts } from "../../todos/components/AnswerDrafts"
import { useStatus } from "../../status/components/StatusContext"
import { ConversationView } from "../../views/components/ConversationView"
import { COPY, DEBUG_INFO, EDIT, NOT_SENT, QUEUED } from "../contract"
import { debugRunOf, timeOf } from "../view"

// The conversation on this device: never a loading state. Until it is restored or synced it is blank, never the empty
// state. "Load earlier" heads it while the device has messages before the window. A queued question is badged only
// while the connection pill shows, with Edit; an unsent one offers Edit or Retry, and Discard; a failed answer offers
// Retry; a finished message offers Copy. Every message shows when it was asked or written; its time, Copy and a queued
// question's Edit show only while the pointer is over it, focus is inside it, or it is tapped; so does an answer's debug
// info, an icon that opens the run that answered it: its flows and steps (src/features/runs). A view
// (src/features/views) shows where it was added, from its own row. An answer shows its agent status under it
// (src/features/status): its question while it needs you, in place of an empty bubble. Empty, it shows `empty`: the
// wordmark on /app, the branch's own empty state on a branch's page.
export function Conversation({ empty = <Wordmark /> }: { readonly empty?: ReactNode } = {}) {
  const { queries, actions } = useChat()
  const { data: statuses } = useLiveQuery(useStatus().queries.statuses)
  // The conversation this tab shows: the branch's on a branch's page (decision 0013 §1), the home one on /app.
  const { data: place } = useLiveQuery(queries.place)
  const shown = queries.of(place?.conversationId)
  const { data: conversation } = useLiveQuery(shown.conversation)
  const { data: history } = useLiveQuery(shown.history)
  const { data: summaries } = useLiveQuery(queries.summaries)
  const { data: connection } = useLiveQuery(queries.connection)
  const pill = connection !== undefined && connection.status !== "up"
  return (
    <ChatTranscript empty={history?.opened === true ? empty : null} rail={<TimelineContribution messages={conversation} summaries={summaries} statuses={statuses} />}>
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
            preview={{ title: message.title, description: message.description, icon: message.icon }}
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
          // An answer's id is its run's: a notification opens `#<run id>`, and the router scrolls it into view.
          id={message.status === "unsent" ? `unsent:${message.id}` : message.id}
          data-id={message.id}
          data-state={message.status}
          data-answer={message.status === "streaming" ? "streaming" : undefined}
          pending={message.status === "streaming" && message.text === ""}
          pendingLabel="Smithers is answering"
          actions={
            <>
            {timeOf(message) === undefined ? null : <RelativeTime ts={timeOf(message)!} />}
            {message.status === "done" ? (
              <CopyButton variant="ghost" size="sm" onCopy={() => actions.copy(message.id)}>
                {COPY}
              </CopyButton>
            ) : message.status === "queued" && pill ? (
              <Button variant="ghost" size="sm" onClick={() => actions.edit(message.id)}>
                {EDIT}
              </Button>
            ) : null}
            {debugRunOf(message) === undefined ? null : (
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/runs/$runId" params={{ runId: debugRunOf(message)! }} aria-label={DEBUG_INFO} title={DEBUG_INFO}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <circle cx="3.5" cy="8" r="2" />
                    <circle cx="12.5" cy="3.5" r="2" />
                    <circle cx="12.5" cy="12.5" r="2" />
                    <path d="M5.5 8h2.5l2.6-3.4M8 8l2.6 3.4" />
                  </svg>
                </Link>
              </Button>
            )}
            </>
          }
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
            ) : null
          }
        >
          {message.role === "assistant" ? (
            <MessageResponse content={message.text} streaming={message.status === "streaming"} />
          ) : (
            message.text
          )}
        </ChatMessage>
        )}
        {message.role === "assistant" ? <div id={message.text === "" && statuses.find(status => status.id === message.id)?.state === "needs_you" ? message.id : undefined}><AnswerStatus id={message.id} /></div> : null}
        {/* A TODO the agent drafted in this answer, private to this device until the person commits it (0016 §3). */}
        {message.role === "assistant" ? <AnswerDrafts id={message.id} /> : null}
        </Fragment>
        ),
      )}
    </ChatTranscript>
  )
}
