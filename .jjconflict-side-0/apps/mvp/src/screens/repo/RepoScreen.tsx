import { RepoHeader } from "../../features/repo/components/RepoHeader"
import { RepoPage } from "../../features/repo/components/RepoPage"
import "./repo-screen.css"

// /$owner/$repo, /$owner/$repo/tree/$ref/$ and /$owner/$repo/blob/$ref/$: the repository at the URL's location. The
// route's loader opens the location (`openRoute`); this screen only renders what the device has.
export function RepoScreen() {
  return (
    <main className="repo-screen" aria-label="Repository">
      <RepoHeader />
      <RepoPage />
    </main>
  )
}
