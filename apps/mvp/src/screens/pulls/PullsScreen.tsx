import { EmptyState, IssuesView } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useNavigate, useParams } from "@tanstack/react-router"
import { SignInButton } from "../../features/auth/components/SignInButton"
import { useIssues } from "../../features/issues/components/IssuesContext"
import { NOT_FOUND } from "../../features/issues/contract"
import { usePulls } from "../../features/pulls/components/PullsContext"
import { listPageOf } from "../../features/pulls/view"
import "./pulls-screen.css"

// /$owner/$repo/pulls: the repository's pull requests, newest first, each with its state (Open, Draft, Merged, Closed).
// Loading until the repository's first complete sync; sign-in, or Not found, for a person who may not read them. The
// route's loader opens the repository (`open`); this screen only renders what the device has.
export function PullsScreen() {
  const { owner, repo } = useParams({ from: "/$owner/$repo/pulls" })
  const { queries } = usePulls()
  const issues = useIssues()
  const { data: rows } = useLiveQuery(queries.list)
  const { data: synced } = useLiveQuery(issues.queries.synced)
  const { data: access } = useLiveQuery(issues.queries.access)
  const navigate = useNavigate()
  const page = listPageOf(rows ?? [], { owner, name: repo }, synced, access)
  if (page.refused === "sign_in") return <main className="pulls-screen" aria-label="Pull requests"><SignInButton /></main>
  if (page.refused === "forbidden") {
    return <main className="pulls-screen" aria-label="Pull requests"><EmptyState title={NOT_FOUND} /></main>
  }
  return (
    <main className="pulls-screen" aria-label="Pull requests">
      <IssuesView
        repo={`${owner}/${repo}`}
        size="full"
        issues={page.pulls}
        loading={page.loading}
        emptyTitle="No pull requests"
        href={(pull) => ("href" in pull ? (pull.href as string) : undefined)}
        onNavigate={(_, href) => void navigate({ href })}
      />
    </main>
  )
}
