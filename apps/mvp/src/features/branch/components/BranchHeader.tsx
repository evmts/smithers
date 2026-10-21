import { Link, useParams, useSearch } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { PresenceAvatars } from "../../presence/components/PresenceAvatars"
import { ShareButton } from "../../sharing/components/ShareButton"
import { useBranch } from "./BranchContext"

// The branch's chrome (decision 0013 §5): `owner / repo ▸ branch`, who else is on it, Share for its owner, and its two
// views, Code and Terminal, as links that keep the location in the URL (`?terminal` opens the terminal). Nothing shows
// for a ref that isn't a tracked branch.
export function BranchHeader() {
  const { queries } = useBranch()
  const { data: current } = useLiveQuery(queries.current)
  const params = useParams({ strict: false })
  const search = useSearch({ strict: false }) as { readonly terminal?: string }
  if (current === undefined || current.status !== "ready") return null
  const to = "/$owner/$repo/tree/$ref/$"
  const routeParams = { owner: params.owner ?? "", repo: params.repo ?? "", ref: params.ref ?? "", _splat: params._splat ?? "" }
  return (
    <nav className="branch-header" aria-label="Branch">
      <span className="branch-header-name">{current.name}</span>
      <PresenceAvatars />
      <ShareButton />
      <Link to={to} params={routeParams} search={{}} aria-current={search.terminal === undefined ? "page" : undefined}>
        Code
      </Link>
      <Link to={to} params={routeParams} search={{ terminal: "me" }} aria-current={search.terminal !== undefined ? "page" : undefined}>
        Terminal
      </Link>
    </nav>
  )
}
