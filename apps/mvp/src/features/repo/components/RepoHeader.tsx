import { Button } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link, useLocation } from "@tanstack/react-router"
import { NotificationsBell } from "../../attention/components/NotificationsBell"
import { ConnectionPill } from "../../chat/components/ConnectionPill"
import { signInHref } from "../../auth/contract"
import { ISSUES } from "../../issues/contract"
import { STACK } from "../../todos/contract"
import { CLONE, TRY_AGAIN } from "../contract"
import { headerOf } from "../view"
import { useRepo } from "./RepoContext"

// The repository's name, which opens its home or root, its Issues and its Stack, then what can be done about it: Clone;
// nothing while it clones (the files' place says Cloning, RepoPage); the sign-in link in Clone's place for a signed-out
// person; or why a clone failed or was refused, with Try again. The person's bell is its last slot, so it never sits on
// an action: the screens that render this header don't float it (attention/contract.ts `BELL_ROUTES`).
export function RepoHeader() {
  const { queries, actions } = useRepo()
  const { data } = useLiveQuery(queries.view)
  const location = useLocation()
  if (data === undefined || data.view.repoId === null) return null
  const { view, repository, clone } = data
  const header = headerOf(repository, clone, view.signedIn, view.answered)
  return (
    <header className="repo-header" aria-label="Repository">
      <h1 className="repo-header-name">
        <Link to="/$owner/$repo" params={{ owner: view.owner, repo: view.name }}>{view.owner} / {view.name}</Link>
      </h1>
      <Button asChild variant="ghost">
        <Link to="/$owner/$repo/issues" params={{ owner: view.owner, repo: view.name }}>{ISSUES}</Link>
      </Button>
      <Button asChild variant="ghost">
        <Link to="/$owner/$repo/stack" params={{ owner: view.owner, repo: view.name }}>{STACK}</Link>
      </Button>
      {header.kind === "clone"
        ? <Button onClick={() => actions.clone(view.owner, view.name)}>{CLONE}</Button>
        : null}
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
      <div role="status" aria-label="Connection" aria-live="polite">
        <ConnectionPill />
      </div>
      <span className="repo-header-bell">
        <NotificationsBell />
      </span>
    </header>
  )
}
