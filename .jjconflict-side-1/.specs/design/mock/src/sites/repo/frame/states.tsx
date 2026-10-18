/* Shared states: useView(key) -> loading|error|empty|ready. Wrap states in RepoFrame.
 * Failed accepts what/reason/onRetry (retry is an alias); its default Retry repairs the network flag. */
import { useEffect, useRef, type ReactNode } from "react"
import { useMock, useRead } from "../../core/mock"
import { Link, useLocation } from "../../core/router"
import { signInRoute } from "../../core/catalog"
import { repo } from "../fixtures"
import { toast } from "../ui/Toast"
import { registerSlash } from "./slash"

export const useView = (key: string): "loading" | "error" | "empty" | "ready" => {
  const { flags } = useMock()
  const read = useRead(key)
  return read.state === "ready" && flags.data === "empty" ? "empty" : read.state
}

export const Loading = ({ variant = "list", rows = 6 }: { variant?: "list" | "file" | "detail"; rows?: number }) => (
  <div className={`repo-frame-loading repo-frame-loading-${variant}`} role="status" aria-label="Loading">
    {variant === "detail" && <div className="repo-frame-skeleton repo-frame-skeleton-title" />}
    {Array.from({ length: rows }, (_, i) => (
      <div className="repo-frame-skeleton-row" key={i}>
        <span className="repo-frame-skeleton" style={{ width: `${40 + (i * 13) % 47}%` }} />
        <span className="repo-frame-skeleton" />
      </div>
    ))}
    <span className="repo-ui-sr">Loading…</span>
  </div>
)

export const Failed = ({ what = "this page", reason = "The repository host didn't respond.", onRetry, retry, primary = false }: {
  what?: string
  reason?: string
  onRetry?: () => void
  retry?: () => void
  primary?: boolean
}) => {
  const { set } = useMock()
  const retryAction = onRetry ?? retry ?? (() => set({ net: "ok" }))
  const action = useRef(retryAction)
  action.current = retryAction
  useEffect(() => registerSlash("retry", {
    purpose: "Retry", fields: [], access: "public", confirm: false, run: () => action.current()
  }), [])
  return (
    <section className="repo-frame-state" role="alert">
      <h2>Couldn't load {what}.</h2>
      <p>{reason}</p>
      <button className={`repo-ui-btn${primary ? " repo-ui-btn-primary" : ""}`} title="/retry" onClick={retryAction}>Retry</button>
    </section>
  )
}

export const Empty = ({ title = "Nothing here yet.", children, action }: {
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
}) => (
  <section className="repo-frame-state">
    <h2>{title}</h2>
    {children}
    {action}
  </section>
)

export const SignInWall = ({ act = "continue", children }: { act?: string; children?: ReactNode }) => {
  const location = useLocation()
  return (
    <section className="repo-frame-state">
      <h2>Sign in to {act}.</h2>
      {children}
      <Link className="repo-ui-btn repo-ui-btn-primary" title="/signin" to={signInRoute(location)}>
        Sign in with GitHub
      </Link>
    </section>
  )
}

export const Denied = ({ act = "do that", children, primary = false }: { act?: string; children?: ReactNode; primary?: boolean }) => {
  const { flags } = useMock()
  const location = useLocation()
  return (
    <section className="repo-frame-state">
      <h2>Only members of {repo.slug} can {act}.</h2>
      {children}
      {flags.as === "out" ? (
        <Link className="repo-ui-btn" to={signInRoute(location)} title="/signin">Sign in</Link>
      ) : (
        <button className={`repo-ui-btn${primary ? " repo-ui-btn-primary" : ""}`} title="/repo.request-access" onClick={() => toast("Access requested from maya.")}>
          Request access
        </button>
      )}
    </section>
  )
}
