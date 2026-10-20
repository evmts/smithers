import { Button, Wordmark } from "@smthrs/ui"
import { SYNC_LOST } from "../../features/chat/schema"
import "./app-shell.css"

// While the app opens this device's conversation.
export function AppLoading() {
  return (
    <main className="app-status" aria-label="Opening" aria-busy="true">
      <Wordmark />
    </main>
  )
}

// When sync failed before the conversation ever opened: nothing to show but the failure and a retry.
export function AppLost({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <main className="app-status" aria-label="Lost connection">
      <p role="alert">{SYNC_LOST}</p>
      <Button variant="solid" onClick={onRetry}>
        Try again
      </Button>
    </main>
  )
}

// When the conversation can't be shown at all, for example when Electric refuses the page it asked for.
export function AppFailed() {
  return (
    <main className="app-status" aria-label="Couldn't open">
      <p role="alert">Smithers couldn't open your conversations.</p>
      <Button variant="solid" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </main>
  )
}
