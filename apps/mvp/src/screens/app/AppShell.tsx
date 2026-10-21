import { Account } from "../../features/auth/components/Account"
import { ComposerGate } from "../../features/auth/components/ComposerGate"
import { ConnectionPill } from "../../features/chat/components/ConnectionPill"
import { Composer } from "../../features/chat/components/Composer"
import { Conversation } from "../../features/chat/components/Conversation"
import { HeaderStatus } from "../../features/status/components/HeaderStatus"
import { ThemeButton } from "../../features/theme/components/ThemeButton"
import { Link } from "@tanstack/react-router"
import { Toasts } from "./Toasts"
import "./app-shell.css"

export function AppShell() {
  return (
    <main className="app-shell" aria-label="App">
      <header className="app-shell-header">
        {/* What the agent is doing, and whether it needs you (decision 0015): its own live region, first in the row. */}
        <div className="app-shell-agent" role="status" aria-label="Smithers" aria-live="polite">
          <HeaderStatus />
        </div>
        {/* The connection pill's live region holds only the pill, so screen readers hear each change of it alone. */}
        <div className="app-shell-connection" role="status" aria-label="Connection" aria-live="polite">
          <ConnectionPill />
        </div>
        {/* Your own flows and this device's runs (decision 0014 §5). */}
        <nav className="app-shell-nav" aria-label="Pages">
          <Link to="/app/flows">Flows</Link>
          <Link to="/app/runs">Runs</Link>
        </nav>
        <ThemeButton />
        <Account />
      </header>
      {/* The toasts, under the header and its pill: the open composer docks over the column's foot, so a toast there
          would hide behind it (decision 0015). */}
      <Toasts />
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
