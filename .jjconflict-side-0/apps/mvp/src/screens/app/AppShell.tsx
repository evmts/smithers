import { Account } from "../../features/auth/components/Account"
import { ComposerGate } from "../../features/auth/components/ComposerGate"
import { ConnectionPill } from "../../features/chat/components/ConnectionPill"
import { Composer } from "../../features/chat/components/Composer"
import { Conversation } from "../../features/chat/components/Conversation"
import { ThemeButton } from "../../features/theme/components/ThemeButton"
import "./app-shell.css"

export function AppShell() {
  return (
    <main className="app-shell" aria-label="App">
      <header className="app-shell-header">
        {/* The connection pill's live region holds only the pill, so screen readers hear each change of it alone. */}
        <div className="app-shell-connection" role="status" aria-label="Connection" aria-live="polite">
          <ConnectionPill />
        </div>
        <ThemeButton />
        <Account />
      </header>
      <section className="app-shell-conversation" aria-label="Conversation">
        <Conversation />
      </section>
      <div className="app-shell-composer">
        <ComposerGate>
          <Composer />
        </ComposerGate>
      </div>
    </main>
  )
}
