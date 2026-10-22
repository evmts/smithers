import { useParams } from "@tanstack/react-router"
import { RepoRunsView } from "../../features/runs/components/RepoRunsView"
import "../runs/runs-screen.css"

// /$owner/$repo/actions: the repository's runs on Cloudflare (docs/features/actions.md).
export function ActionsScreen() {
  const { owner, repo } = useParams({ from: "/$owner/$repo/actions" })
  return (
    <main className="runs-screen" aria-label="Runs">
      <header className="runs-screen-header">
        <h1>Runs</h1>
      </header>
      <RepoRunsView owner={owner} name={repo} />
    </main>
  )
}
