import { Link, useParams } from "@tanstack/react-router"
import { SecretsPage } from "../../features/secrets/components/SecretsPage"
import { SECRETS } from "../../features/secrets/copy"
import "./secrets-screen.css"

// /$owner/$repo/settings/secrets: the repository's secrets by name, which an Admin adds, rotates and deletes
// (docs/features/secrets.md#the-secrets-page). The route's `beforeLoad` opens the repository's list; this screen only
// renders what the device has.
export function SecretsScreen() {
  const { owner, repo } = useParams({ from: "/$owner/$repo/settings/secrets" })
  return (
    <main className="secrets-screen" aria-label={SECRETS}>
      <header className="secrets-screen-header">
        <Link to="/$owner/$repo" params={{ owner, repo }}>{owner} / {repo}</Link>
        <h1>{SECRETS}</h1>
      </header>
      <SecretsPage owner={owner} repo={repo} />
    </main>
  )
}
