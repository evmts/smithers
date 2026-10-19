import { Composer } from "../../features/chat/components/Composer"
import { Conversation } from "../../features/chat/components/Conversation"
import "./app-shell.css"

export function AppShell() {
  return (
    <main className="app-shell" aria-label="App">
      <section className="app-shell-conversation" aria-label="Conversation">
        <Conversation />
      </section>
      <div className="app-shell-composer">
        <Composer />
      </div>
    </main>
  )
}
