import { Link } from "@tanstack/react-router"
import { DraftCard } from "../../features/flows-ui/components/DraftCard"
import "./flows-screen.css"

// /app/flows/drafts/$draftId: one draft at full size; its route's loader shows it.
export function DraftScreen() {
  return (
    <main className="flows-screen" aria-label="Draft">
      <header className="flows-screen-header">
        <Link to="/app/flows">Flows</Link>
      </header>
      <DraftCard />
    </main>
  )
}
