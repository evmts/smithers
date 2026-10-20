import { Button, Spinner } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link, useLocation } from "@tanstack/react-router"
import { signInHref } from "../../auth/contract"
import { ISSUES } from "../../issues/contract"
import { CLONE, TRY_AGAIN } from "../contract"
import { headerOf } from "../view"
import { useRepo } from "./RepoContext"

// The repository's name and its Issues, then what can be done about it: Clone; one spinner while it clones; the sign-in link in
// Clone's place for a signed-out person; or why a clone failed or was refused, with Try again.
export function RepoHeader() {
  const { queries, actions } = useRepo()
  const { data } = useLiveQuery(queries.view)
  const location = useLocation()
  if (data === undefined || data.view.repoId === null) return null
  const { view, repository, clone } = data
  const header = headerOf(repository, clone, view.signedIn)
  return (
    <header className="repo-header" aria-label="Repository">
      <h1 className="repo-header-name">{view.owner} / {view.name}</h1>
      <Button asChild variant="ghost">
        <Link to="/$owner/$repo/issues" params={{ owner: view.owner, repo: view.name }}>{ISSUES}</Link>
      </Button>
      {header.kind === "clone"
        ? <Button onClick={() => actions.clone(view.owner, view.name)}>{CLONE}</Button>
        : null}
      {header.kind === "cloning" ? <Spinner aria-label="Cloning" /> : null}
      {header.kind === "sign_in"
        ? (
          <Button asChild variant="outline">
            <a href={signInHref(`${location.pathname}${location.searchStr}`)}>{header.text}</a>
          </Button>
        )
        : null}
      {header.kind === "refused"
        ? (
          <>
            <span role="status">{header.text}</span>
            <Button variant="outline" onClick={() => actions.retryClone(view.owner, view.name)}>{TRY_AGAIN}</Button>
          </>
        )
        : null}
    </header>
  )
}
