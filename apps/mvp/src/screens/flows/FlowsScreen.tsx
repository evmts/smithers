import { Link } from "@tanstack/react-router"
import { FlowsPage } from "../../features/flows-ui/components/FlowsPage"
import "./flows-screen.css"

// /app/flows: your own flows and drafts (decision 0014 §5).
export function FlowsScreen() {
  return (
    <main className="flows-screen" aria-label="Flows">
      <header className="flows-screen-header">
        <Link to="/app">Back to chat</Link>
        <h1>Flows</h1>
      </header>
      <FlowsPage />
    </main>
  )
}
