import { Badge, Button, EmptyState, IssuesView } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { useAuth } from "../../features/auth/components/AuthContext"
import { SignInButton } from "../../features/auth/components/SignInButton"
import { useIssues } from "../../features/issues/components/IssuesContext"
import {
  DISCARD,
  EDIT,
  ENABLE_TRIAGE,
  issuePath,
  NEW_ISSUE,
  NOT_FOUND,
  PAUSE_TRIAGE,
} from "../../features/issues/contract"
import { listProps, mayManageTriage, mayWrite, triageSwitchOf } from "../../features/issues/view"
import "./issues-screen.css"

// /$owner/$repo/issues: the repository's issues, this device's own new ones first with their chip, each with its triage
// chip, New issue for a person who may open one, and Enable triage or Pause triage for a Maintainer. A repository whose issues this person may not read shows sign-in, or Not found. A new issue that wasn't sent gets Edit, back to the form, and Discard. The route's loader
// opens the repository (`open`); this screen only renders what the device has.
export function IssuesScreen() {
  const { owner, repo } = useParams({ from: "/$owner/$repo/issues" })
  const { queries, actions } = useIssues()
  const auth = useAuth()
  const { data: rows } = useLiveQuery(queries.list)
  const { data: synced } = useLiveQuery(queries.synced)
  const { data: access } = useLiveQuery(queries.access)
  const { data: triage } = useLiveQuery(queries.triage)
  const { data: triagePending } = useLiveQuery(queries.triagePending)
  const { data: session } = useLiveQuery(auth.queries.session)
  const { data: confirmed } = useLiveQuery(auth.queries.confirmed)
  const navigate = useNavigate()
  const list = listProps(rows ?? [], synced, access, triage !== undefined && !triage.paused)
  const triageSwitch = triageSwitchOf(triage, triagePending ?? [])
  // A repository whose issues this person may not read: sign in, or nothing to show.
  if (list.refused === "sign_in") return <main className="issues-screen" aria-label="Issues"><SignInButton /></main>
  if (list.refused === "forbidden") {
    return <main className="issues-screen" aria-label="Issues"><EmptyState title={NOT_FOUND} /></main>
  }
  return (
    <main className="issues-screen" aria-label="Issues">
      <IssuesView
        repo={`${owner}/${repo}`}
        size="full"
        issues={list.issues}
        loading={list.loading}
        href={(issue) => (issue.number === null ? undefined : issuePath(owner, repo, issue.number))}
        onNavigate={(_, href) => void navigate({ href })}
        actions={session !== undefined && mayWrite(session, confirmed)
          ? (
            <>
              {mayManageTriage(session, confirmed)
                ? (
                  <Button
                    variant="outline"
                    disabled={triageSwitch.disabled}
                    onClick={() =>
                      triageSwitch.action === "enable"
                        ? actions.enableTriage(owner, repo)
                        : actions.pauseTriage(owner, repo)}
                  >
                    {triageSwitch.action === "enable" ? ENABLE_TRIAGE : PAUSE_TRIAGE}
                  </Button>
                )
                : null}
              <Button asChild>
                <Link to="/$owner/$repo/issues/new" params={{ owner, repo }}>{NEW_ISSUE}</Link>
              </Button>
            </>
          )
          : undefined}
      />
      {list.notSent.length === 0 ? null : (
        <ul className="issues-not-sent" aria-label="Not sent">
          {list.notSent.map((write) => (
            <li key={write.id} className="issues-not-sent-row">
              <span className="issues-not-sent-title">{write.title}</span>
              {write.reason === undefined ? null : <Badge variant="destructive">{write.reason}</Badge>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const to = actions.edit(write.id)
                  if (to !== undefined) void navigate({ href: to })
                }}
              >
                {EDIT}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => actions.discard(write.id)}>{DISCARD}</Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
