import { Button, Wordmark } from "@smthrs/ui"
import "./app-shell.css"

// While the app opens this device's conversations.
export function AppLoading() {
  return (
    <main className="app-status" aria-label="Opening" aria-busy="true">
      <Wordmark />
    </main>
  )
}

// When this device's conversations can't be opened, for example when the browser blocks site storage.
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
