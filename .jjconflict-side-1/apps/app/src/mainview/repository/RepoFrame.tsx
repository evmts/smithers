import { WORDMARK } from "../Wordmark"
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { BookOpen, Search, X } from "lucide-react"
import "./ui.css"
import "./frame.css"
import "./repository.css"

export interface RepositoryTab { readonly path: string; readonly label: string; readonly count?: number }
export const REPOSITORY_TABS: ReadonlyArray<RepositoryTab> = [
  { path: "", label: "Code" }, { path: "issues", label: "Issues" }, { path: "pulls", label: "Pull requests" }
]

const dockQuery = "(min-width: 1440px)"
const subscribeDock = (notify: () => void) => {
  const media = window.matchMedia(dockQuery)
  media.addEventListener("change", notify)
  return () => media.removeEventListener("change", notify)
}
const dockSnapshot = () => window.matchMedia(dockQuery).matches

/** Repository route shell. `children` is the plain content slot shared by repo views. */
export function RepoFrame({ repo, login, publicRepo, tabs = REPOSITORY_TABS, ask, onAsk, onSignIn, children }: {
  tabs?: ReadonlyArray<RepositoryTab>
  repo: string; member?: boolean; login?: string; publicRepo?: boolean
  ask: ReactNode; onAsk: () => void; onSignIn: () => void; children: ReactNode
}) {
  const [open, setOpen] = useState<boolean | undefined>(undefined)
  const docked = useSyncExternalStore(subscribeDock, dockSnapshot, () => false)
  const [searchOpen, setSearchOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const base = `/${repo}`
  const [owner, name] = repo.split("/")
  const openAsk = () => { if (!login) { onSignIn(); return }; setOpen(true); onAsk() }
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div className="repo-frame" data-ask-open={!login ? "false" : open === undefined ? "auto" : String(open)} onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); event.stopPropagation(); openAsk()
    }
    if (event.key === "Escape") {
      const details = (event.target as HTMLElement).closest("details[open]")
      if (details) { details.removeAttribute("open"); details.querySelector<HTMLElement>("summary")?.focus(); return }
      if (searchOpen) { setSearchOpen(false); document.querySelector<HTMLButtonElement>(".repo-frame-search-toggle")?.focus(); return }
      close()
    }
  }}>
    <a className="repo-frame-skip" href="#repo-content">Skip to content</a>
    <header className="repo-frame-global">
      <a className="repo-frame-mark" href="/" aria-label="Smithers home"><pre aria-label="Smithers">{WORDMARK.join("\n")}</pre></a>
      <div className="repo-frame-crumbs"><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></div>
      <div className="repo-frame-global-spacer" />
      <form className="repo-frame-search" role="search" action={`${base}/search`} data-expanded={searchOpen}>
        <Search size={16} aria-hidden="true" /><input name="q" aria-label="Search this repository" placeholder="Search this repository…" /><kbd>/</kbd>
      </form>
      <button className="repo-ui-icon-btn repo-frame-search-toggle" aria-label="Search repository" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); if (!searchOpen) requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".repo-frame-search input")?.focus()) }}><Search size={19}/></button>
      {login ? <><details className="repo-frame-avatar-menu"><summary className="repo-frame-avatar-button repo-ui-btn" aria-label={`${login}'s account menu`}>{login.slice(0, 1).toUpperCase()}</summary><div className="repo-ui-menu repo-frame-account"><span>{login}</span><a href="/">Your repositories</a></div></details></> : <button className="repo-ui-btn repo-ui-btn-quiet" onClick={onSignIn}>Sign in</button>}
    </header>
    <div className="repo-frame-workspace"><div className="repo-frame-page">
      <header className="repo-frame-repo-header">
        <div className="repo-frame-repo-title-row"><div className="repo-frame-repo-title"><BookOpen size={20} aria-hidden="true"/><h1><a href="/">{owner}</a><span>/</span><a href={base}>{name}</a></h1>{publicRepo && <span className="repo-frame-visibility">Public</span>}</div>
          <button ref={trigger} className="repo-ui-btn repo-ui-btn-primary repo-frame-ask-button" aria-label="Ask" aria-controls="repo-ask" aria-expanded={Boolean(login) && (open ?? docked)} onClick={openAsk}>Ask <kbd>⌘K</kbd></button>
        </div>
        <nav className="repo-ui-tabs" aria-label="Repository">{tabs.map(({path, label, count}) => <a className="repo-ui-tab" key={path} href={`${base}${path ? `/${path}` : ""}`} aria-current={window.location.pathname.replace(/\/$/, "") === `${base}${path ? `/${path}` : ""}` ? "page" : undefined}>{label}{count !== undefined && <span className="repo-ui-counter">{count}</span>}</a>)}</nav>
      </header>
      <main id="repo-content" tabIndex={-1} className="repo-frame-content" data-keyboard-pane="Repository">{children}</main>
    </div>
    <aside id="repo-ask" className="repo-frame-ask" aria-label="Ask" data-keyboard-pane="Ask">
      <div className="repo-frame-ask-heading"><h2>Ask</h2><button className="repo-ui-icon-btn" aria-label="Close Ask" onClick={close}><X size={18}/></button></div>
      <div className="repository-chat">{ask}</div>
    </aside></div>
  </div>
}
