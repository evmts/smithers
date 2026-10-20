import { Link } from "@tanstack/react-router"
import { NewFlowCard } from "../../features/flows-ui/components/NewFlowCard"
import "./flows-screen.css"

// /app/flows/new: a new flow of your own, or the next revision of one (`?name=`), from what it should do.
export function NewFlowScreen() {
  return (
    <main className="flows-screen" aria-label="New flow">
      <header className="flows-screen-header">
        <Link to="/app/flows">Flows</Link>
      </header>
      <NewFlowCard />
    </main>
  )
}
