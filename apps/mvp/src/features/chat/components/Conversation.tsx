import { ChatMessage, ChatTranscript, MessageResponse, Wordmark } from "@smthrs/ui"
import { useConversation } from "../queries"

export function Conversation() {
  const conversation = useConversation()
  return (
    <ChatTranscript empty={<Wordmark />}>
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
