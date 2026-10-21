import { Link } from "@tanstack/react-router"
import { FlowCodeCard } from "../../features/flows-ui/components/FlowCodeCard"
import "./flows-screen.css"

// /app/flows/code/$name: a flow's code at full size; its route's loader reads it.
export function CodeScreen() {
  return (
    <main className="flows-screen" aria-label="Code">
      <header className="flows-screen-header">
        <Link to="/app/flows">Flows</Link>
      </header>
      <FlowCodeCard />
    </main>
  )
}
