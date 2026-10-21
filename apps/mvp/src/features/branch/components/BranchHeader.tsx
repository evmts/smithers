import { Badge } from "@smthrs/ui"
import { Link, useParams, useSearch } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { PresenceAvatars } from "../../presence/components/PresenceAvatars"
import { ShareButton } from "../../sharing/components/ShareButton"
import type { Access } from "../contract"
import { statusOf } from "../view"
import { useBranch } from "./BranchContext"

// The branch's chrome (decision 0013 §5): the branch's name and what this person may do on it (`Owner`, `Can edit`,
// `Can view`), everyone on it (this person first), Share for its owner, and its two views, Code and Terminal, as tabs
// that keep the location in the URL (`?terminal` opens the terminal). Tracking can wait offline: the name and links
// remain, with access and presence only once verified. Missing or refused branches have no chrome.
export function BranchHeader({ access, pending = false }: { readonly access: Access | "none" | undefined; readonly pending?: boolean }) {
  const { queries } = useBranch()
  const { data: current } = useLiveQuery(queries.current)
  const params = useParams({ strict: false })
  const search = useSearch({ strict: false }) as { readonly terminal?: string }
  if (!pending && (current === undefined || current.status !== "ready" || access === "none")) return null
  const to = "/$owner/$repo/tree/$ref/$"
  const routeParams = { owner: params.owner ?? "", repo: params.repo ?? "", ref: params.ref ?? "", _splat: params._splat ?? "" }
  const status = statusOf(pending ? undefined : access)
  return (
    <nav className="branch-header" aria-label="Branch">
      <span className="branch-header-name">{pending ? params.ref : current?.name}</span>
      {status === undefined ? null : <Badge variant="muted">{status}</Badge>}
      <span className="branch-header-presence">
        {!pending && access !== undefined ? <><PresenceAvatars /><ShareButton /></> : null}
      </span>
      <span className="branch-header-views">
        {/* Exact, so the router marks only the view that shows: Code's empty search is part of any terminal's. */}
        <Link to={to} params={routeParams} search={{}} activeOptions={{ exact: true }} aria-current={search.terminal === undefined ? "page" : undefined}>
          Code
        </Link>
        <Link to={to} params={routeParams} search={{ terminal: "me" }} activeOptions={{ exact: true }} aria-current={search.terminal !== undefined ? "page" : undefined}>
          Terminal
        </Link>
      </span>
    </nav>
  )
}
