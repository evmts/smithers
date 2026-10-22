import { Link } from "@tanstack/react-router"
import { ConversationList } from "../../features/conversations/components/ConversationList"
import "./conversations-screen.css"

// /app/conversations: your conversations, one per branch you opened (docs/features/conversations.md).
export function ConversationsScreen() {
  return (
    <main className="conversations-screen" aria-label="Conversations">
      <header className="conversations-screen-header">
        <Link to="/app">Back to chat</Link>
        <h1>Conversations</h1>
      </header>
      <ConversationList />
    </main>
  )
}
