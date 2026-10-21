import { Link } from "@tanstack/react-router"
import { FlowSummaryView } from "../../features/runs/components/FlowSummaryView"
import { RunListView } from "../../features/runs/components/RunListView"
import "./runs-screen.css"

// /app/runs: every run on this device, newest first (decision 0014 §5); its route's loader reads the engine.
export function RunsScreen() {
  return (
    <main className="runs-screen" aria-label="Runs">
      <header className="runs-screen-header">
        <Link to="/app">Back to chat</Link>
        <h1>Runs</h1>
      </header>
      <FlowSummaryView />
      <RunListView />
    </main>
  )
}
