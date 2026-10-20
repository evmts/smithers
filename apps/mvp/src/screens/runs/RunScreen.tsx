import { Link } from "@tanstack/react-router"
import { RunPageView } from "../../features/runs/components/RunPageView"
import "./runs-screen.css"

// /app/runs/$runId: one run's page (decision 0014 §5); its route's loader reads it from this device's engine.
export function RunScreen() {
  return (
    <main className="runs-screen" aria-label="Run">
      <header className="runs-screen-header">
        <Link to="/app/runs">Runs</Link>
      </header>
      <RunPageView />
    </main>
  )
}
