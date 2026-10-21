import { Link, useParams } from "@tanstack/react-router"
import { BranchHeader } from "../../features/branch/components/BranchHeader"
import { ConnectionPill } from "../../features/chat/components/ConnectionPill"
import "./branch-screen.css"

// A branch can wait offline for tracking or its live parts. Only public route chrome shows until the loader finishes.
// The URL names the destination even while warming still leaves the previous branch in the device's rows.
export function BranchPendingScreen() {
  const params = useParams({ from: "/$owner/$repo/tree/$ref/$" })
  return (
    <main className="branch-screen" aria-label="Repository" data-workspace="false">
      <header className="repo-header" aria-label="Repository">
        <h1 className="repo-header-name">
          <Link to="/$owner/$repo" params={{ owner: params.owner, repo: params.repo }}>
            {params.owner} / {params.repo}
          </Link>
        </h1>
        <div role="status" aria-label="Connection" aria-live="polite">
          <ConnectionPill />
        </div>
      </header>
      <BranchHeader access={undefined} pending />
    </main>
  )
}
