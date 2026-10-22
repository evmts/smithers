import { Link, useParams } from "@tanstack/react-router"
import { actionsPath } from "../../features/actions/contract"
import { RunPageView } from "../../features/runs/components/RunPageView"
import "../runs/runs-screen.css"

// /$owner/$repo/actions/runs/$runId: one of the repository's runs, read and followed on Cloudflare
// (docs/features/actions.md); its route's loader opens it.
export function ActionRunScreen() {
  const { owner, repo } = useParams({ from: "/$owner/$repo/actions/runs/$runId" })
  return (
    <main className="runs-screen" aria-label="Run">
      <header className="runs-screen-header">
        <Link to={actionsPath(owner, repo) as never}>Runs</Link>
      </header>
      <RunPageView />
    </main>
  )
}
